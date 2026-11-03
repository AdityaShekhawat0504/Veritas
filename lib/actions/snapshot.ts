import { asc, eq, inArray } from "drizzle-orm";
import {
  assumptions,
  indicatorCatalog,
  indicators,
  killCriteria,
  positions,
  securities,
  theses,
  thesisVersions,
} from "@/db/schema";
import type { Tx } from "@/db/types";
import { ActionError } from "./errors";

export interface IndicatorSnapshot {
  id: string;
  catalogKey: string;
  operator: string;
  threshold: number;
  breakThreshold: number | null;
}

export interface ThesisSnapshot {
  thesis: {
    id: string;
    claim: string;
    direction: string;
    horizonMonths: number;
    convictionPct: number;
    status: string;
  };
  security: { ticker: string; cik: string | null; name: string | null };
  position: { sizePct: number; entryDate: string | null; entryPrice: number | null } | null;
  assumptions: {
    id: string;
    text: string;
    falsifiableText: string;
    critical: boolean;
    category: string;
    probability: number | null;
    resolveBy: string | null;
    status: string;
    indicators: IndicatorSnapshot[];
  }[];
  killCriteria: {
    id: string;
    condition: string;
    triggeredAt: string | null;
    indicators: IndicatorSnapshot[];
  }[];
}

/** Read the full current state of a thesis as a plain JSON object. */
export async function buildSnapshot(tx: Tx, thesisId: string): Promise<ThesisSnapshot> {
  const t = (await tx.select().from(theses).where(eq(theses.id, thesisId)).limit(1))[0];
  if (!t) throw new ActionError("NOT_FOUND", "Thesis not found");
  const sec = (await tx.select().from(securities).where(eq(securities.id, t.securityId)).limit(1))[0];
  const pos = (await tx.select().from(positions).where(eq(positions.thesisId, thesisId)).limit(1))[0];
  const asm = await tx
    .select()
    .from(assumptions)
    .where(eq(assumptions.thesisId, thesisId))
    .orderBy(asc(assumptions.sortOrder), asc(assumptions.createdAt));
  const kcs = await tx
    .select()
    .from(killCriteria)
    .where(eq(killCriteria.thesisId, thesisId))
    .orderBy(asc(killCriteria.sortOrder), asc(killCriteria.createdAt));

  const asmIds = asm.map((a) => a.id);
  const kcIds = kcs.map((k) => k.id);
  type IndRow = { ind: typeof indicators.$inferSelect; key: string };
  const indRows: IndRow[] = [];
  if (asmIds.length > 0) {
    indRows.push(
      ...(await tx
        .select({ ind: indicators, key: indicatorCatalog.key })
        .from(indicators)
        .innerJoin(indicatorCatalog, eq(indicators.catalogId, indicatorCatalog.id))
        .where(inArray(indicators.assumptionId, asmIds))
        .orderBy(asc(indicators.createdAt))),
    );
  }
  if (kcIds.length > 0) {
    indRows.push(
      ...(await tx
        .select({ ind: indicators, key: indicatorCatalog.key })
        .from(indicators)
        .innerJoin(indicatorCatalog, eq(indicators.catalogId, indicatorCatalog.id))
        .where(inArray(indicators.killCriterionId, kcIds))
        .orderBy(asc(indicators.createdAt))),
    );
  }

  const toInd = (r: IndRow): IndicatorSnapshot => ({
    id: r.ind.id,
    catalogKey: r.key,
    operator: r.ind.operator,
    threshold: r.ind.threshold,
    breakThreshold: r.ind.breakThreshold,
  });

  return {
    thesis: {
      id: t.id,
      claim: t.claim,
      direction: t.direction,
      horizonMonths: t.horizonMonths,
      convictionPct: t.convictionPct,
      status: t.status,
    },
    security: { ticker: sec?.ticker ?? "", cik: sec?.cik ?? null, name: sec?.name ?? null },
    position: pos
      ? { sizePct: pos.sizePct, entryDate: pos.entryDate, entryPrice: pos.entryPrice }
      : null,
    assumptions: asm.map((a) => ({
      id: a.id,
      text: a.text,
      falsifiableText: a.falsifiableText,
      critical: a.critical,
      category: a.category,
      probability: a.probability,
      resolveBy: a.resolveBy,
      status: a.status,
      indicators: indRows.filter((r) => r.ind.assumptionId === a.id).map(toInd),
    })),
    killCriteria: kcs.map((k) => ({
      id: k.id,
      condition: k.condition,
      triggeredAt: k.triggeredAt ? k.triggeredAt.toISOString() : null,
      indicators: indRows.filter((r) => r.ind.killCriterionId === k.id).map(toInd),
    })),
  };
}

/** Freeze the current state as a new thesis version. Never updates old ones. */
export async function freezeVersion(
  tx: Tx,
  thesisId: string,
  version: number,
  reason: string,
  createdBy: string | null,
): Promise<ThesisSnapshot> {
  const snapshot = await buildSnapshot(tx, thesisId);
  await tx.insert(thesisVersions).values({
    thesisId,
    version,
    snapshot,
    reason,
    createdBy,
  });
  return snapshot;
}
