import { eq } from "drizzle-orm";
import { assumptions, outcomes } from "@/db/schema";
import type { Db } from "@/db/types";
import type { Actor } from "./context";
import { loadThesisForUpdate, parseInput, requireWriter } from "./context";
import { ActionError } from "./errors";
import { writeLog } from "./log";
import { resolveAssumptionSchema, type ResolveAssumptionInput } from "./schemas";
import { requireAuthorOrPm } from "./theses";

/**
 * resolveAssumption: record whether an assumption turned out true, false or
 * ambiguous. The probability in force at resolution is stored with the
 * outcome so it can be scored later.
 */
export async function resolveAssumption(db: Db, actor: Actor, input: ResolveAssumptionInput) {
  const data = parseInput(resolveAssumptionSchema, input);
  return db.transaction(async (tx) => {
    const writer = await requireWriter(tx, actor);
    const a = (await tx.select().from(assumptions).where(eq(assumptions.id, data.assumptionId)).limit(1).for("update"))[0];
    if (!a) throw new ActionError("NOT_FOUND", "Assumption not found");
    const thesis = await loadThesisForUpdate(tx, actor, a.thesisId);
    requireAuthorOrPm(writer.role, writer.userId, thesis);
    if (a.status !== "active") throw new ActionError("CONFLICT", `Assumption is ${a.status}`);

    const outcome = (
      await tx
        .insert(outcomes)
        .values({
          thesisId: thesis.id,
          assumptionId: a.id,
          kind: "assumption",
          result: data.result,
          forecastProbability: a.probability,
          note: data.note ?? null,
          resolvedBy: writer.userId,
        })
        .returning()
    )[0];
    await tx.update(assumptions).set({ status: "resolved", updatedAt: new Date() }).where(eq(assumptions.id, a.id));
    await writeLog(tx, actor, {
      firmId: thesis.firmId,
      action: "resolveAssumption",
      objectType: "assumption",
      objectId: a.id,
      before: { status: a.status, probability: a.probability, resolveBy: a.resolveBy },
      after: { status: "resolved", outcome },
    });
    return outcome;
  });
}
