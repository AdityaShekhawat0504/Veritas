// Read-only queries for pages and API routes. Nothing here writes; all writes
// go through lib/actions.

import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db/client";
import {
  actionLog,
  assumptions,
  checks,
  decisions,
  evidence,
  indicatorCatalog,
  indicators,
  killCriteria,
  memberships,
  positions,
  securities,
  theses,
  thesisVersions,
} from "@/db/schema";
import type { Verdict } from "@/db/enums";
import type { Db } from "@/db/types";
import type { Actor } from "@/lib/actions";
import { requireUserId } from "@/lib/auth";

/** The signed-in user as an action actor (their first firm), or null. */
export async function currentActor(db: Db = getDb()): Promise<(Actor & { type: "user" }) | null> {
  const userId = await requireUserId();
  if (!userId) return null;
  const m = (
    await db
      .select()
      .from(memberships)
      .where(eq(memberships.userId, userId))
      .orderBy(asc(memberships.createdAt))
      .limit(1)
  )[0];
  if (!m) return null;
  return { type: "user", userId, firmId: m.firmId };
}

export interface ThesisListItem {
  id: string;
  ticker: string;
  claim: string;
  direction: string;
  status: string;
  convictionPct: number;
  updatedAt: Date;
  assumptionCount: number;
  criticalCount: number;
  verdicts: Record<Verdict, number>;
}

/** Latest verdict per assumption id. */
export async function latestVerdicts(db: Db, assumptionIds: string[]): Promise<Map<string, Verdict>> {
  const out = new Map<string, Verdict>();
  if (assumptionIds.length === 0) return out;
  const rows = await db
    .select({ assumptionId: checks.assumptionId, verdict: checks.verdict, seq: checks.seq })
    .from(checks)
    .where(inArray(checks.assumptionId, assumptionIds))
    .orderBy(desc(checks.seq));
  for (const r of rows) if (!out.has(r.assumptionId)) out.set(r.assumptionId, r.verdict);
  return out;
}

export async function listTheses(db: Db, firmId: string): Promise<ThesisListItem[]> {
  const rows = await db
    .select({ thesis: theses, ticker: securities.ticker })
    .from(theses)
    .innerJoin(securities, eq(theses.securityId, securities.id))
    .where(eq(theses.firmId, firmId))
    .orderBy(desc(theses.updatedAt));
  const ids = rows.map((r) => r.thesis.id);
  const asm: (typeof assumptions.$inferSelect)[] = ids.length
    ? await db.select().from(assumptions).where(inArray(assumptions.thesisId, ids))
    : [];
  const verdicts = await latestVerdicts(db, asm.map((a) => a.id));
  return rows.map(({ thesis, ticker }) => {
    const mine = asm.filter((a) => a.thesisId === thesis.id && a.status === "active");
    const counts: Record<Verdict, number> = {
      supported: 0,
      weakened: 0,
      contradicted: 0,
      insufficient_evidence: 0,
    };
    for (const a of mine) {
      const v = verdicts.get(a.id);
      if (v) counts[v]++;
    }
    return {
      id: thesis.id,
      ticker,
      claim: thesis.claim,
      direction: thesis.direction,
      status: thesis.status,
      convictionPct: thesis.convictionPct,
      updatedAt: thesis.updatedAt,
      assumptionCount: mine.length,
      criticalCount: mine.filter((a) => a.critical).length,
      verdicts: counts,
    };
  });
}

export interface ThesisDetail {
  thesis: typeof theses.$inferSelect;
  security: typeof securities.$inferSelect;
  position: typeof positions.$inferSelect | null;
  assumptions: {
    row: typeof assumptions.$inferSelect;
    indicators: { row: typeof indicators.$inferSelect; catalogKey: string; label: string; unit: string }[];
    checks: { row: typeof checks.$inferSelect; evidence: (typeof evidence.$inferSelect)[] }[];
  }[];
  killCriteria: {
    row: typeof killCriteria.$inferSelect;
    indicators: { row: typeof indicators.$inferSelect; catalogKey: string; label: string; unit: string }[];
  }[];
  versions: (typeof thesisVersions.$inferSelect)[];
  decisions: (typeof decisions.$inferSelect)[];
  log: (typeof actionLog.$inferSelect)[];
}

/** Everything the thesis page shows, scoped to the viewer's firm. */
export async function getThesisDetail(db: Db, firmId: string, thesisId: string): Promise<ThesisDetail | null> {
  const t = (await db.select().from(theses).where(and(eq(theses.id, thesisId), eq(theses.firmId, firmId))).limit(1))[0];
  if (!t) return null;
  const security = (await db.select().from(securities).where(eq(securities.id, t.securityId)).limit(1))[0];
  const position = (await db.select().from(positions).where(eq(positions.thesisId, t.id)).limit(1))[0] ?? null;
  const asm = await db
    .select()
    .from(assumptions)
    .where(eq(assumptions.thesisId, t.id))
    .orderBy(asc(assumptions.sortOrder), asc(assumptions.createdAt));
  const kcs = await db
    .select()
    .from(killCriteria)
    .where(eq(killCriteria.thesisId, t.id))
    .orderBy(asc(killCriteria.sortOrder), asc(killCriteria.createdAt));
  const asmIds = asm.map((a) => a.id);
  const kcIds = kcs.map((k) => k.id);

  const indSelect = {
    row: indicators,
    catalogKey: indicatorCatalog.key,
    label: indicatorCatalog.label,
    unit: indicatorCatalog.unit,
  };
  type IndRow = { row: typeof indicators.$inferSelect; catalogKey: string; label: string; unit: string };
  const asmInd: IndRow[] = asmIds.length
    ? await db
        .select(indSelect)
        .from(indicators)
        .innerJoin(indicatorCatalog, eq(indicators.catalogId, indicatorCatalog.id))
        .where(inArray(indicators.assumptionId, asmIds))
    : [];
  const kcInd: IndRow[] = kcIds.length
    ? await db
        .select(indSelect)
        .from(indicators)
        .innerJoin(indicatorCatalog, eq(indicators.catalogId, indicatorCatalog.id))
        .where(inArray(indicators.killCriterionId, kcIds))
    : [];
  const chk: (typeof checks.$inferSelect)[] = asmIds.length
    ? await db.select().from(checks).where(inArray(checks.assumptionId, asmIds)).orderBy(desc(checks.seq))
    : [];
  const chkIds = chk.map((c) => c.id);
  const ev: (typeof evidence.$inferSelect)[] = chkIds.length ? await db.select().from(evidence).where(inArray(evidence.checkId, chkIds)) : [];

  const versions = await db
    .select()
    .from(thesisVersions)
    .where(eq(thesisVersions.thesisId, t.id))
    .orderBy(desc(thesisVersions.version));
  const decs = await db.select().from(decisions).where(eq(decisions.thesisId, t.id)).orderBy(desc(decisions.createdAt));
  const objectIds = [t.id, ...chkIds, ...decs.map((d) => d.id), ...asmIds, ...kcIds];
  const log = await db
    .select()
    .from(actionLog)
    .where(inArray(actionLog.objectId, objectIds))
    .orderBy(desc(actionLog.seq))
    .limit(200);

  return {
    thesis: t,
    security,
    position,
    assumptions: asm.map((a) => ({
      row: a,
      indicators: asmInd.filter((i) => i.row.assumptionId === a.id),
      checks: chk
        .filter((c) => c.assumptionId === a.id)
        .map((c) => ({ row: c, evidence: ev.filter((e) => e.checkId === c.id) })),
    })),
    killCriteria: kcs.map((k) => ({ row: k, indicators: kcInd.filter((i) => i.row.killCriterionId === k.id) })),
    versions,
    decisions: decs,
    log,
  };
}

export async function listCatalog(db: Db) {
  return db
    .select()
    .from(indicatorCatalog)
    .where(eq(indicatorCatalog.active, true))
    .orderBy(asc(indicatorCatalog.source), asc(indicatorCatalog.key));
}
