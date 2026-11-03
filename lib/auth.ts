// Auth.js (NextAuth v5) with Google sign-in and JWT sessions. On first sign-in
// the user is created through the ensureUser action (which writes action_log),
// so no auth adapter writes to the database behind the action layer.
import NextAuth from "next-auth";
import { getDb } from "@/db/client";
import { ensureUser } from "@/lib/actions";
import { authConfig } from "./auth.config";

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  session: { strategy: "jwt" },
  callbacks: {
    ...authConfig.callbacks,
    async jwt({ token, user }) {
      if (user?.email) {
        const account = await ensureUser(getDb(), {
          email: user.email,
          name: user.name ?? null,
          image: user.image ?? null,
        });
        token.uid = account.userId;
      }
      return token;
    },
    session({ session, token }) {
      if (typeof token.uid === "string" && session.user) session.user.id = token.uid;
      return session;
    },
  },
});

/** The signed-in user's id, or null. */
export async function requireUserId(): Promise<string | null> {
  const session = await auth();
  return session?.user?.id ?? null;
}
