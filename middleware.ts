// Gate every page and API route behind sign-in. Built from the edge-safe config
// only (no database code). The matcher excludes the auth API, the Inngest
// endpoint (it authenticates with its signing key), the sign-in page and
// static assets.
import NextAuth from "next-auth";
import { authConfig } from "@/lib/auth.config";

export default NextAuth(authConfig).auth;

export const config = {
  matcher: ["/((?!api/auth|api/inngest|signin|_next/static|_next/image|favicon.ico).*)"],
};
