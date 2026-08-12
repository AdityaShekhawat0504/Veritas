// Auth.js (NextAuth v5) — Google OAuth as the login gate for the whole app.
// Prisma adapter persists User/Account/Session; JWT session strategy keeps the
// session readable in edge middleware (see lib/auth.config.ts). Reads
// AUTH_SECRET / AUTH_GOOGLE_ID / AUTH_GOOGLE_SECRET from the environment.
import NextAuth from "next-auth";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "./db";
import { authConfig } from "./auth.config";

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  session: { strategy: "jwt" },
  ...authConfig,
});

/**
 * Require an authenticated user in a route handler / server action.
 * Returns the user id, or null when there is no session.
 */
export async function requireUserId(): Promise<string | null> {
  const session = await auth();
  return session?.user?.id ?? null;
}
