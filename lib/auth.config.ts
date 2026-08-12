// Edge-safe Auth.js config: providers, pages, and the route-gating callback.
// This file must NOT import Prisma or any Node-only code — it is loaded by the
// middleware, which runs on the edge runtime. The Prisma adapter is attached
// separately in lib/auth.ts (Node runtime only).
import type { NextAuthConfig } from "next-auth";
import Google from "next-auth/providers/google";

export const authConfig = {
  providers: [Google],
  pages: { signIn: "/signin" },
  // Trust the host header. Vercel is auto-trusted, but any other production
  // start (a local `next start`, a container) otherwise fails with UntrustedHost.
  trustHost: true,
  callbacks: {
    // Runs in middleware for every matched route — gate access on a session.
    authorized({ auth }) {
      return !!auth?.user;
    },
    // Carry the user id from the adapter user (sign-in) through the JWT into
    // the session, so server code can scope every query by session.user.id.
    jwt({ token, user }) {
      if (user) token.id = user.id;
      return token;
    },
    session({ session, token }) {
      if (token.id && session.user) session.user.id = token.id as string;
      return session;
    },
  },
} satisfies NextAuthConfig;
