import { beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { alerts, checks, events, killCriteria } from "@/db/schema";
import { createConfirmedThesis, seedIndicatorCatalog, systemActor } from "@/lib/actions";
import { INDICATOR_CATALOG } from "@/lib/data/catalog";
import { createEdgarClient, type CompanyConcept } from "@/lib/data/edgar";
import { createRateLimiter } from "@/lib/data/rateLimit";
import { pollEdgar } from "@/lib/jobs/ingest";
import { runNumericChecks } from "@/lib/jobs/numericChecks";
import { createWorld, NOW, type World } from "./helpers/db";
import { fakeFetch, loadFixture } from "./helpers/fakeFetch";

// Phase 2 done-when, offline: a numeric assumption on a security gets a check
// from (fixture) EDGAR data, and re-running produces no duplicate alert.
// The live version of this test is in docs/GO_LIVE.md.

const UA = "Veritas-test test@example.com";
const revenue = loadFixture("edgar-concept-revenue.json") as CompanyConcept;

function edgarWith(revenueFixture: CompanyConcept) {
  const f = fakeFetch({
    "/submissions/CIK0000000001.json": loadFixture("edgar-submissions.json"),
    "/RevenueFromContractWithCustomerExcludingAssessedTax.json": revenueFixture,
    "/Revenues.json": loadFixture("edgar-concept-revenues-old.json"),
    "/GrossProfit.json": loadFixture("edgar-concept-grossprofit.json"),
  });
  return { edgar: createEdgarClient({ userAgent: UA, fetchImpl: f, limiter: createRateLimiter({ max: 1000, intervalMs: 1 }) }), f };
}

let w: World;
let thesisId: string;
let killId: string;

beforeAll(async () => {
  w = await createWorld();
  await seedIndicatorCatalog(w.db, systemActor("test"), INDICATOR_CATALOG);
  const snap = await createConfirmedThesis(
    w.db,
    w.analyst,
    {
      thesis: {
        ticker: "EXMP",
        cik: "1",
        securityName: "EXAMPLE CORP (fixture)",
        claim: "Example Corp keeps compounding revenue",
        direction: "long",
        horizonMonths: 12,
        convictionPct: 70,
      },
      extraction: {
        assumptions: [
          {
            text: "Revenue grows double digits",
            falsifiableText: "Quarterly revenue grows at least 10% y/y",
            critical: true,
            category: "revenue",
            probability: 0.7,
            resolveBy: "2026-12-31",
            indicators: [{ catalogKey: "revenue_yoy_pct_q", operator: "gte", threshold: 10, breakThreshold: 5 }],
          },
          {
            text: "Rates fall",
            falsifiableText: "Fed funds below 3%",
            critical: false,
            category: "macro",
            indicators: [{ catalogKey: "fed_funds_rate", operator: "lt", threshold: 3 }],
          },
        ],
        killCriteria: [
          {
            condition: "Gross margin falls below 35%",
            indicators: [{ catalogKey: "gross_margin_pct_q", operator: "lt", threshold: 35 }],
          },
        ],
      },
    },
    { now: NOW },
  );
  thesisId = snap.thesis.id;
  killId = snap.killCriteria[0].id;
});

describe("numeric check job", () => {
  it("checks from EDGAR data, skips unconfigured sources, and triggers the kill criterion", async () => {
    const { edgar } = edgarWith(revenue);
    const s = await runNumericChecks(w.db, { edgar }, { thesisId, trigger: "manual" });
    expect(s.checks).toHaveLength(1);
    expect(s.checks[0].verdict).toBe("supported");
    // FRED is not configured here: skipped with a reason, not a fake verdict.
    expect(s.skipped.map((x) => x.reason).join(" ")).toMatch(/FRED is not configured/);
    // Gross margin 34% < 35%: kill criterion fires once.
    expect(s.killCriteriaTriggered).toEqual([killId]);
    const kc = (await w.db.select().from(killCriteria).where(eq(killCriteria.id, killId)))[0];
    expect(kc.triggeredAt).not.toBeNull();

    const row = (await w.db.select().from(checks).where(eq(checks.id, s.checks[0].checkId)))[0];
    expect(row.model).toBeNull();
    expect((row.observed as { value: number }).value).toBe(15);
  });

  it("re-running with the same data creates a new check but no new alert", async () => {
    const before = (await w.db.select().from(alerts).where(eq(alerts.thesisId, thesisId))).length;
    const { edgar } = edgarWith(revenue);
    const s = await runNumericChecks(w.db, { edgar }, { thesisId, trigger: "sweep" });
    expect(s.checks).toHaveLength(1);
    expect(s.alertIds).toEqual([]);
    expect(s.killCriteriaTriggered).toEqual([]);
    const after = (await w.db.select().from(alerts).where(eq(alerts.thesisId, thesisId))).length;
    expect(after).toBe(before);
  });

  it("a weaker filing changes the verdict and raises exactly one alert", async () => {
    const weaker: CompanyConcept = {
      ...revenue,
      units: {
        USD: [
          ...revenue.units.USD,
          { start: "2025-07-01", end: "2025-09-30", val: 1080, accn: "0000000001-25-000020", form: "10-Q", filed: "2025-11-01" },
          { start: "2024-07-01", end: "2024-09-30", val: 1000, accn: "0000000001-25-000020", form: "10-Q", filed: "2025-11-01" },
        ],
      },
    };
    const { edgar } = edgarWith(weaker);
    const s = await runNumericChecks(w.db, { edgar }, { thesisId, trigger: "event" });
    expect(s.checks[0].verdict).toBe("weakened");
    expect(s.alertIds).toHaveLength(1);
    const again = await runNumericChecks(w.db, { edgar }, { thesisId, trigger: "sweep" });
    expect(again.alertIds).toEqual([]);
  });

  it("users only check theses in their own firm", async () => {
    const { edgar } = edgarWith(revenue);
    const s = await runNumericChecks(w.db, { edgar }, { thesisId, trigger: "manual", actor: w.outsider });
    expect(s.checks).toHaveLength(0);
  });
});

describe("EDGAR polling", () => {
  it("records each watched filing once", async () => {
    const { edgar } = edgarWith(revenue);
    const now = new Date("2025-08-15T00:00:00Z");
    const first = await pollEdgar(w.db, edgar, { now, lookbackDays: 31 });
    // The 10-Q filed 2025-08-01 and the 8-K filed 2025-07-15 are inside 31 days; the May 10-Q is not.
    expect(first).toHaveLength(2);
    const second = await pollEdgar(w.db, edgar, { now, lookbackDays: 31 });
    expect(second).toHaveLength(0);
    const rows = await w.db.select().from(events).where(eq(events.kind, "filing"));
    expect(rows).toHaveLength(2);
  });
});
