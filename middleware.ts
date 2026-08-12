// Gate every app route (and API route) behind the Google login. Built from the
// edge-safe config only — no Prisma here. The `authorized` callback in
// lib/auth.config.ts redirects unauthenticated page requests to /signin. The
// matcher excludes the auth API, the sign-in page, and Next's static assets.
import NextAuth from "next-auth";
import { authConfig } from "@/lib/auth.config";

export default NextAuth(authConfig).auth;

export const config = {
  matcher: ["/((?!api/auth|signin|_next/static|_next/image|favicon.ico).*)"],
};
