import { and, eq } from "drizzle-orm";
import type { z } from "zod";
import { memberships, theses } from "@/db/schema";
import type { Tx } from "@/db/types";
import type { Role } from "@/db/enums";
import { ActionError } from "./errors";
import { canWrite } from "./rules";

/** Who is performing an action. System actors are background jobs. */
export type Actor =
  | { type: "user"; userId: string; firmId: string }
  | { type: "system"; name: string };

export function systemActor(name: string): Actor {
  return { type: "system", name };
}

/** Parse input with a zod schema or throw a VALIDATION ActionError. */
export function parseInput<T>(schema: z.ZodType<T, z.ZodTypeDef, unknown>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw new ActionError(
      "VALIDATION",
      "Invalid input",
      result.error.issues.map((i) => `${i.path.join(".") || "input"}: ${i.message}`),
    );
  }
  return result.data;
}

export function requireUser(actor: Actor): { userId: string; firmId: string } {
  if (actor.type !== "user") {
    throw new ActionError("FORBIDDEN", "This action needs a signed-in user");
  }
  return { userId: actor.userId, firmId: actor.firmId };
}

/** Load the actor's role in a firm, or throw FORBIDDEN. */
export async function roleIn(tx: Tx, userId: string, firmId: string): Promise<Role> {
  const rows = await tx
    .select({ role: memberships.role })
    .from(memberships)
    .where(and(eq(memberships.userId, userId), eq(memberships.firmId, firmId)))
    .limit(1);
  const row = rows[0];
  if (!row) throw new ActionError("FORBIDDEN", "Not a member of this firm");
  return row.role;
}

/** Require a user who may write in the actor's firm. Returns the role. */
export async function requireWriter(tx: Tx, actor: Actor): Promise<{ userId: string; firmId: string; role: Role }> {
  const u = requireUser(actor);
  const role = await roleIn(tx, u.userId, u.firmId);
  if (!canWrite(role)) throw new ActionError("FORBIDDEN", "Viewers cannot change data");
  return { ...u, role };
}

export type ThesisRow = typeof theses.$inferSelect;

/**
 * Load a thesis and lock it for the rest of the transaction. For user actors
 * the thesis must belong to the actor's firm.
 */
export async function loadThesisForUpdate(tx: Tx, actor: Actor, thesisId: string): Promise<ThesisRow> {
  const rows = await tx.select().from(theses).where(eq(theses.id, thesisId)).limit(1).for("update");
  const thesis = rows[0];
  if (!thesis) throw new ActionError("NOT_FOUND", "Thesis not found");
  if (actor.type === "user" && thesis.firmId !== actor.firmId) {
    throw new ActionError("NOT_FOUND", "Thesis not found");
  }
  return thesis;
}
