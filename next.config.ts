import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Load these from node_modules at runtime instead of bundling them.
  // PGlite is only used by tests; mammoth and unpdf parse uploaded memos.
  serverExternalPackages: ["@electric-sql/pglite", "postgres", "mammoth", "unpdf"],
  // No ESLint setup in this repo yet; type checking still runs during build.
  eslint: { ignoreDuringBuilds: true },
};

export default nextConfig;
