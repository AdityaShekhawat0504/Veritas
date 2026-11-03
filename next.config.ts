import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // PGlite is only used in tests and local scripts; keep it and the Postgres
  // driver out of the client and server bundles' transpile step.
  serverExternalPackages: ["@electric-sql/pglite", "postgres"],
  // No ESLint setup in this repo yet; type checking still runs during build.
  eslint: { ignoreDuringBuilds: true },
};

export default nextConfig;
