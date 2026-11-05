import { asc, eq } from "drizzle-orm";
import { z } from "zod";
import { firms, memberships, users } from "@/db/schema";
import type { Role } from "@/db/enums";
import type { Db } from "@/db/types";
import { parseInput, systemActor } from "./context";
import { writeLog } from "./log";

const profileSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  name: z.string().nullable().optional(),
  image: z.string().nullable().optional(),
});

/**
 * ensureUser: called on sign-in. Creates the user on first sign-in together
 * with a personal firm where they are admin. Returns the user's first firm.
 */
export async function ensureUser(
  db: Db,
  profile: z.input<typeof profileSchema>,
): Promise<{ userId: string; firmId: string; role: Role; created: boolean }> {
  const p = parseInput(profileSchema, profile);
  return db.transaction(async (tx) => {
    const existing = (await tx.select().from(users).where(eq(users.email, p.email)).limit(1))[0];
    if (existing) {
      const m = (
        await tx
          .select()
          .from(memberships)
          .where(eq(memberships.userId, existing.id))
          .orderBy(asc(memberships.createdAt))
          .limit(1)
      )[0];
      if (m) return { userId: existing.id, firmId: m.firmId, role: m.role, created: false };
    }

    const user =
      existing ??
      (await tx.insert(users).values({ email: p.email, name: p.name ?? null, image: p.image ?? null }).returning())[0];
    const firm = (
      await tx
        .insert(firms)
        .values({ name: `${p.name || p.email}'s workspace` })
        .returning()
    )[0];
    await tx.insert(memberships).values({ firmId: firm.id, userId: user.id, role: "admin" });
    await writeLog(tx, systemActor("auth"), {
      firmId: firm.id,
      action: "createAccount",
      objectType: "user",
      objectId: user.id,
      after: { email: user.email, firmId: firm.id, role: "admin" },
    });
    return { userId: user.id, firmId: firm.id, role: "admin" as Role, created: true };
  });
}

/** addMember: add an existing user to a firm with a role (used by tests and admin tooling). */
export async function addMember(db: Db, input: { firmId: string; email: string; role: Role; actorName: string }) {
  return db.transaction(async (tx) => {
    const email = input.email.trim().toLowerCase();
    const user =
      (await tx.select().from(users).where(eq(users.email, email)).limit(1))[0] ??
      (await tx.insert(users).values({ email }).returning())[0];
    const m = (await tx.insert(memberships).values({ firmId: input.firmId, userId: user.id, role: input.role }).returning())[0];
    await writeLog(tx, systemActor(input.actorName), {
      firmId: input.firmId,
      action: "addMember",
      objectType: "membership",
      objectId: m.id,
      after: { userId: user.id, role: input.role },
    });
    return { userId: user.id, firmId: input.firmId, role: input.role };
  });
}
