import { and, eq, inArray } from "drizzle-orm";
import { assumptions, indicatorCatalog, indicators, killCriteria, theses } from "@/db/schema";
import type { Db, Tx } from "@/db/types";
import type { Actor } from "./context";
import { parseInput, requireWriter } from "./context";
import { ActionError } from "./errors";
import { writeLog } from "./log";
import { breakThresholdProblem } from "./rules";
import { bindIndicatorSchema, type BindIndicatorInput, type IndicatorSpec } from "./schemas";

/**
 * Check indicator specs against the closed catalog (rule 6) and their
 * thresholds. Returns catalog ids by key. Throws VALIDATION with every problem.
 */
export async function validateIndicatorSpecs(
  tx: Tx,
  specs: { path: string; spec: IndicatorSpec }[],
): Promise<Map<string, string>> {
  const keys = [...new Set(specs.map((s) => s.spec.catalogKey))];
  const byKey = new Map<string, string>();
  if (keys.length > 0) {
    const rows = await tx
      .select({ id: indicatorCatalog.id, key: indicatorCatalog.key })
      .from(indicatorCatalog)
      .where(and(inArray(indicatorCatalog.key, keys), eq(indicatorCatalog.active, true)));
    for (const r of rows) byKey.set(r.key, r.id);
  }
  const problems: string[] = [];
  for (const { path, spec } of specs) {
    if (!byKey.has(spec.catalogKey)) {
      problems.push(`${path}: "${spec.catalogKey}" is not in indicator_catalog`);
    }
    const p = breakThresholdProblem(spec.operator, spec.threshold, spec.breakThreshold);
    if (p) problems.push(`${path}: ${p}`);
  }
  if (problems.length > 0) throw new ActionError("VALIDATION", "Invalid indicators", problems);
  return byKey;
}

export async function insertIndicator(
  tx: Tx,
  catalogId: string,
  spec: IndicatorSpec,
  target: { assumptionId: string } | { killCriterionId: string },
  createdBy: string | null,
): Promise<typeof indicators.$inferSelect> {
  const rows = await tx
    .insert(indicators)
    .values({
      assumptionId: "assumptionId" in target ? target.assumptionId : null,
      killCriterionId: "killCriterionId" in target ? target.killCriterionId : null,
      catalogId,
      operator: spec.operator,
      threshold: spec.threshold,
      breakThreshold: spec.breakThreshold ?? null,
      createdBy,
    })
    .returning();
  return rows[0];
}

/** bindIndicator: attach a catalog indicator to an assumption or a kill criterion. */
export async function bindIndicator(db: Db, actor: Actor, input: BindIndicatorInput) {
  const data = parseInput(bindIndicatorSchema, input);
  if ((data.assumptionId ? 1 : 0) + (data.killCriterionId ? 1 : 0) !== 1) {
    throw new ActionError("VALIDATION", "Give exactly one of assumptionId or killCriterionId");
  }
  return db.transaction(async (tx) => {
    const writer = await requireWriter(tx, actor);

    let thesisId: string;
    if (data.assumptionId) {
      const a = (await tx.select().from(assumptions).where(eq(assumptions.id, data.assumptionId)).limit(1))[0];
      if (!a) throw new ActionError("NOT_FOUND", "Assumption not found");
      if (a.status !== "active") throw new ActionError("CONFLICT", "Assumption is not active");
      thesisId = a.thesisId;
    } else {
      const k = (await tx.select().from(killCriteria).where(eq(killCriteria.id, data.killCriterionId as string)).limit(1))[0];
      if (!k) throw new ActionError("NOT_FOUND", "Kill criterion not found");
      if (k.triggeredAt) throw new ActionError("CONFLICT", "Kill criterion already triggered");
      thesisId = k.thesisId;
    }
    const t = (await tx.select().from(theses).where(eq(theses.id, thesisId)).limit(1))[0];
    if (!t || t.firmId !== writer.firmId) throw new ActionError("NOT_FOUND", "Thesis not found");
    if (t.status === "closed") throw new ActionError("CONFLICT", "Thesis is closed");

    const spec: IndicatorSpec = {
      catalogKey: data.catalogKey,
      operator: data.operator,
      threshold: data.threshold,
      breakThreshold: data.breakThreshold ?? null,
    };
    const byKey = await validateIndicatorSpecs(tx, [{ path: "indicator", spec }]);
    const target = data.assumptionId
      ? { assumptionId: data.assumptionId }
      : { killCriterionId: data.killCriterionId as string };
    const row = await insertIndicator(tx, byKey.get(spec.catalogKey) as string, spec, target, writer.userId);

    await writeLog(tx, actor, {
      firmId: t.firmId,
      action: "bindIndicator",
      objectType: "indicator",
      objectId: row.id,
      after: { ...row, catalogKey: spec.catalogKey },
    });
    return row;
  });
}
