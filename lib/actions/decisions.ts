import { eq } from "drizzle-orm";
import { decisions, positions } from "@/db/schema";
import type { Db } from "@/db/types";
import type { Actor } from "./context";
import { loadThesisForUpdate, parseInput, requireWriter } from "./context";
import { ActionError } from "./errors";
import { writeLog } from "./log";
import { applyDecision } from "./rules";
import { recordDecisionSchema, type RecordDecisionInput } from "./schemas";
import { requireAuthorOrPm } from "./theses";

/** recordDecision: log add / trim / hold / exit with a rationale and update the position. */
export async function recordDecision(db: Db, actor: Actor, input: RecordDecisionInput) {
  const data = parseInput(recordDecisionSchema, input);
  return db.transaction(async (tx) => {
    const writer = await requireWriter(tx, actor);
    const thesis = await loadThesisForUpdate(tx, actor, data.thesisId);
    requireAuthorOrPm(writer.role, writer.userId, thesis);
    if (thesis.status !== "open") throw new ActionError("CONFLICT", "Decisions need an open thesis");

    const pos = (await tx.select().from(positions).where(eq(positions.thesisId, thesis.id)).limit(1).for("update"))[0];
    const currentSize = pos ? pos.sizePct : 0;
    const applied = applyDecision(data.action, currentSize, data.sizeChangePct);
    if ("problem" in applied) throw new ActionError("VALIDATION", "Decision rejected", [applied.problem]);

    if (pos) {
      await tx
        .update(positions)
        .set({ sizePct: applied.sizeAfterPct, updatedAt: new Date() })
        .where(eq(positions.id, pos.id));
    } else if (applied.sizeAfterPct > 0) {
      await tx.insert(positions).values({ thesisId: thesis.id, sizePct: applied.sizeAfterPct });
    }
    const decision = (
      await tx
        .insert(decisions)
        .values({
          thesisId: thesis.id,
          action: data.action,
          sizeChangePct: applied.sizeChangePct,
          sizeAfterPct: applied.sizeAfterPct,
          rationale: data.rationale,
          decidedBy: writer.userId,
        })
        .returning()
    )[0];
    await writeLog(tx, actor, {
      firmId: thesis.firmId,
      action: "recordDecision",
      objectType: "decision",
      objectId: decision.id,
      before: { sizePct: currentSize },
      after: decision,
    });
    return decision;
  });
}
