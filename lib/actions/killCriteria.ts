import { eq } from "drizzle-orm";
import { alerts, killCriteria, theses } from "@/db/schema";
import type { Db } from "@/db/types";
import type { Actor } from "./context";
import { parseInput, requireWriter } from "./context";
import { ActionError } from "./errors";
import { writeLog } from "./log";
import { triggerKillCriterionSchema, type TriggerKillCriterionInput } from "./schemas";

/** triggerKillCriterion: mark a kill criterion as hit, once, and raise an alert. */
export async function triggerKillCriterion(db: Db, actor: Actor, input: TriggerKillCriterionInput) {
  const data = parseInput(triggerKillCriterionSchema, input);
  return db.transaction(async (tx) => {
    const k = (await tx.select().from(killCriteria).where(eq(killCriteria.id, data.killCriterionId)).limit(1).for("update"))[0];
    if (!k) throw new ActionError("NOT_FOUND", "Kill criterion not found");
    const t = (await tx.select().from(theses).where(eq(theses.id, k.thesisId)).limit(1))[0];
    if (!t) throw new ActionError("NOT_FOUND", "Thesis not found");
    if (actor.type === "user") {
      const writer = await requireWriter(tx, actor);
      if (writer.firmId !== t.firmId) throw new ActionError("NOT_FOUND", "Kill criterion not found");
    }
    if (t.status !== "open") throw new ActionError("CONFLICT", "Thesis is not open");
    if (k.triggeredAt) throw new ActionError("CONFLICT", "Kill criterion already triggered");

    const now = new Date();
    await tx
      .update(killCriteria)
      .set({ triggeredAt: now, triggeredReason: data.reason })
      .where(eq(killCriteria.id, k.id));
    const alert = (
      await tx
        .insert(alerts)
        .values({ firmId: t.firmId, thesisId: t.id, killCriterionId: k.id, kind: "kill_criterion" })
        .returning({ id: alerts.id })
    )[0];
    await writeLog(tx, actor, {
      firmId: t.firmId,
      action: "triggerKillCriterion",
      objectType: "kill_criterion",
      objectId: k.id,
      before: { triggeredAt: null },
      after: { triggeredAt: now, reason: data.reason, alertId: alert.id },
    });
    return { killCriterionId: k.id, alertId: alert.id };
  });
}
