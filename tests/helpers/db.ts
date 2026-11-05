import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite/vector";
import { drizzle } from "drizzle-orm/pglite";
import * as schema from "@/db/schema";
import { runMigrations } from "@/db/migrate";
import type { Db } from "@/db/types";
import { addMember, ensureUser, seedIndicatorCatalog, systemActor, type Actor, type CatalogItem } from "@/lib/actions";
import type { z } from "zod";
import type { assumptionInputSchema } from "@/lib/actions/schemas";

type AssumptionDraft = z.input<typeof assumptionInputSchema>;

/** A fresh in-memory Postgres (PGlite) with all migrations applied. */
export async function createTestDb(): Promise<{ db: Db; client: PGlite }> {
  const client = await PGlite.create({ extensions: { vector } });
  await runMigrations({
    exec: async (sql) => {
      await client.exec(sql);
    },
    appliedNames: async () => {
      const res = await client.query<{ name: string }>("SELECT name FROM schema_migrations");
      return res.rows.map((r) => r.name);
    },
  });
  const db = drizzle(client, { schema }) as unknown as Db;
  return { db, client };
}

/** Small catalog used by action tests. */
export const TEST_CATALOG: CatalogItem[] = [
  {
    key: "revenue_yoy_pct_q",
    label: "Revenue growth, quarter vs same quarter last year",
    source: "xbrl",
    sourceCode: "RevenueFromContractWithCustomerExcludingAssessedTax|Revenues",
    unit: "%",
    transform: "yoy_pct",
    frequency: "quarterly",
    description: "Test item",
  },
  {
    key: "gross_margin_pct_q",
    label: "Gross margin, quarterly",
    source: "xbrl",
    sourceCode: "GrossProfit",
    denominatorCode: "RevenueFromContractWithCustomerExcludingAssessedTax|Revenues",
    unit: "%",
    transform: "ratio_pct",
    frequency: "quarterly",
    description: "Test item",
  },
  {
    key: "fed_funds_rate",
    label: "Effective federal funds rate",
    source: "fred",
    sourceCode: "FEDFUNDS",
    unit: "%",
    transform: "level",
    frequency: "monthly",
    description: "Test item",
  },
];

export interface World {
  db: Db;
  client: PGlite;
  analyst: Actor & { type: "user" };
  pm: Actor & { type: "user" };
  viewer: Actor & { type: "user" };
  outsider: Actor & { type: "user" };
  system: Actor;
}

let counter = 0;

/** One firm (owner, analyst, PM, viewer) plus an outsider in a separate firm. */
export async function createWorld(): Promise<World> {
  const { db, client } = await createTestDb();
  counter++;
  const owner = await ensureUser(db, { email: `owner${counter}@example.com`, name: "Owner" });
  const analyst = await addMember(db, { firmId: owner.firmId, email: `analyst${counter}@example.com`, role: "analyst", actorName: "test" });
  const pm = await addMember(db, { firmId: owner.firmId, email: `pm${counter}@example.com`, role: "pm", actorName: "test" });
  const viewer = await addMember(db, { firmId: owner.firmId, email: `viewer${counter}@example.com`, role: "viewer", actorName: "test" });
  const outsider = await ensureUser(db, { email: `outsider${counter}@example.com`, name: "Outsider" });
  await seedIndicatorCatalog(db, systemActor("test"), TEST_CATALOG);
  const u = (x: { userId: string; firmId: string }) => ({ type: "user" as const, userId: x.userId, firmId: x.firmId });
  return {
    db,
    client,
    analyst: u(analyst),
    pm: u(pm),
    viewer: u(viewer),
    outsider: u(outsider),
    system: systemActor("test-job"),
  };
}

export const NOW = new Date("2026-01-15T12:00:00Z");

/** A valid critical assumption with a numeric indicator. */
export function criticalAssumption(overrides: Partial<AssumptionDraft> = {}): AssumptionDraft {
  return {
    text: "Revenue keeps growing double digits",
    falsifiableText: "Quarterly revenue grows at least 10% year on year",
    critical: true,
    category: "revenue" as const,
    probability: 0.7,
    resolveBy: "2026-12-31",
    indicators: [{ catalogKey: "revenue_yoy_pct_q", operator: "gte" as const, threshold: 10, breakThreshold: 5 }],
    ...overrides,
  };
}

export function supportingAssumption(overrides: Partial<AssumptionDraft> = {}): AssumptionDraft {
  return {
    text: "Margins hold",
    falsifiableText: "Quarterly gross margin stays at or above 40%",
    critical: false,
    category: "margin" as const,
    indicators: [],
    ...overrides,
  };
}

export const THESIS_INPUT = {
  ticker: "EXMP",
  cik: "1",
  securityName: "Example Corp (test fixture)",
  claim: "Example Corp keeps compounding revenue",
  direction: "long" as const,
  horizonMonths: 12,
  convictionPct: 70,
};

/** Return the text of an error and its cause (Drizzle wraps driver errors). */
export function errorText(err: unknown): string {
  const parts: string[] = [];
  let e: unknown = err;
  for (let i = 0; i < 4 && e; i++) {
    if (e instanceof Error) {
      parts.push(e.message);
      e = (e as Error & { cause?: unknown }).cause;
    } else {
      parts.push(String(e));
      break;
    }
  }
  return parts.join(" | ");
}

export async function expectReject(p: Promise<unknown>, pattern: RegExp): Promise<void> {
  let caught: unknown = null;
  try {
    await p;
  } catch (err) {
    caught = err;
  }
  if (!caught) throw new Error(`Expected rejection matching ${pattern}, but it resolved`);
  const text = errorText(caught);
  if (!pattern.test(text)) throw new Error(`Expected rejection matching ${pattern}, got: ${text}`);
}
