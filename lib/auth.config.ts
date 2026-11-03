// Edge-safe Auth.js config: providers, pages and the route-gating callback.
// Loaded by the middleware (edge runtime), so it must not import database code.
// The sign-in callbacks that write to the database live in lib/auth.ts.
import type { NextAuthConfig } from "next-auth";
import Google from "next-auth/providers/google";

export const authConfig = {
  providers: [Google],
  pages: { signIn: "/signin" },
  // Trust the host header. Vercel is trusted automatically; other hosts are not.
  trustHost: true,
  callbacks: {
    authorized({ auth }) {
      return !!auth?.user;
    },
  },
} satisfies NextAuthConfig;
