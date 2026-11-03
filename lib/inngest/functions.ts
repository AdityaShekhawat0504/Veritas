// Background jobs. Each function is thin: the logic lives in lib/jobs and is
// tested without Inngest. Concurrency is capped at 1 per function so parallel
// runs stay under the EDGAR and FRED rate limits.

import { z } from "zod";
import { getDb } from "@/db/client";
import { dataSourcesFromEnv } from "@/lib/data/env";
import { ingestFred, ingestPrices, pollEdgar, type NewEvent } from "@/lib/jobs/ingest";
import { runNumericChecks, type CheckScope } from "@/lib/jobs/numericChecks";
import { EVENTS, inngest } from "./client";

const eventData = z.object({
  eventId: z.string().uuid(),
  securityId: z.string().uuid().nullable().optional(),
  sourceCode: z.string().optional(),
});

async function checkAndReport(scope: CheckScope) {
  const s = await runNumericChecks(getDb(), dataSourcesFromEnv(), scope);
  return {
    checks: s.checks.length,
    alertIds: s.alertIds,
    killCriteriaTriggered: s.killCriteriaTriggered.length,
    skipped: s.skipped,
  };
}

function toEvents(name: string, created: { eventId: string; securityId: string | null; sourceCode?: string }[]) {
  return created.map((c) => ({
    name,
    data: { eventId: c.eventId, securityId: c.securityId, sourceCode: c.sourceCode },
  }));
}

export const ingestEdgarFn = inngest.createFunction(
  { id: "ingest-edgar", concurrency: { limit: 1 } },
  { cron: "TZ=America/New_York 0 7-21/2 * * 1-5" },
  async ({ step }) => {
    const created = await step.run("poll", async () => {
      const src = dataSourcesFromEnv();
      if (!src.edgar) return [] as NewEvent[];
      return pollEdgar(getDb(), src.edgar);
    });
    if (created.length > 0) await step.sendEvent("emit-filings", toEvents(EVENTS.filingNew, created));
    return { newFilings: created.length };
  },
);

export const ingestFredFn = inngest.createFunction(
  { id: "ingest-fred", concurrency: { limit: 1 } },
  { cron: "TZ=America/New_York 30 17 * * 1-5" },
  async ({ step }) => {
    const created = await step.run("poll", async () => {
      const src = dataSourcesFromEnv();
      if (!src.fred) return [] as NewEvent[];
      return ingestFred(getDb(), src.fred);
    });
    if (created.length > 0) await step.sendEvent("emit-releases", toEvents(EVENTS.macroReleased, created));
    return { newReleases: created.length };
  },
);

export const ingestPricesFn = inngest.createFunction(
  { id: "ingest-prices", concurrency: { limit: 1 } },
  { cron: "TZ=America/New_York 0 19 * * 1-5" },
  async ({ step }) => {
    const created = await step.run("poll", async () => {
      const src = dataSourcesFromEnv();
      if (!src.prices) return [] as NewEvent[];
      return ingestPrices(getDb(), src.prices);
    });
    if (created.length > 0) await step.sendEvent("emit-prices", toEvents(EVENTS.priceUpdated, created));
    return { newPrices: created.length };
  },
);

function alertEvents(alertIds: string[]) {
  return alertIds.map((alertId) => ({ name: EVENTS.alertCreated, data: { alertId } }));
}

export const checkOnFilingFn = inngest.createFunction(
  { id: "check-on-filing", concurrency: { limit: 1 } },
  { event: EVENTS.filingNew },
  async ({ event, step }) => {
    const d = eventData.parse(event.data);
    const r = await step.run("check", () =>
      checkAndReport({ securityId: d.securityId ?? undefined, sources: ["xbrl"], trigger: "event", eventId: d.eventId }),
    );
    if (r.alertIds.length > 0) await step.sendEvent("emit-alerts", alertEvents(r.alertIds));
    return r;
  },
);

export const checkOnMacroFn = inngest.createFunction(
  { id: "check-on-macro", concurrency: { limit: 1 } },
  { event: EVENTS.macroReleased },
  async ({ event, step }) => {
    const d = eventData.parse(event.data);
    const r = await step.run("check", () =>
      checkAndReport({ sources: ["fred"], sourceCode: d.sourceCode, trigger: "event", eventId: d.eventId }),
    );
    if (r.alertIds.length > 0) await step.sendEvent("emit-alerts", alertEvents(r.alertIds));
    return r;
  },
);

export const checkOnPriceFn = inngest.createFunction(
  { id: "check-on-price", concurrency: { limit: 1 } },
  { event: EVENTS.priceUpdated },
  async ({ event, step }) => {
    const d = eventData.parse(event.data);
    const r = await step.run("check", () =>
      checkAndReport({ securityId: d.securityId ?? undefined, sources: ["price"], trigger: "event", eventId: d.eventId }),
    );
    if (r.alertIds.length > 0) await step.sendEvent("emit-alerts", alertEvents(r.alertIds));
    return r;
  },
);

export const weeklySweepFn = inngest.createFunction(
  { id: "weekly-sweep", concurrency: { limit: 1 } },
  { cron: "TZ=UTC 0 6 * * 1" },
  async ({ step }) => {
    const r = await step.run("sweep", () => checkAndReport({ trigger: "sweep" }));
    if (r.alertIds.length > 0) await step.sendEvent("emit-alerts", alertEvents(r.alertIds));
    return r;
  },
);

export const functions = [
  ingestEdgarFn,
  ingestFredFn,
  ingestPricesFn,
  checkOnFilingFn,
  checkOnMacroFn,
  checkOnPriceFn,
  weeklySweepFn,
];
