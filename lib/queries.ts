// Read-only queries for pages and API routes. Nothing here writes; all writes
// go through lib/actions.

import { asc, desc, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db/client";
import { assumptions, checks, memberships, securities, theses } from "@/db/schema";
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
  const asm = ids.length
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
