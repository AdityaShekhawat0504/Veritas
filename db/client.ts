// Production database client (Neon Postgres via postgres-js). Created lazily so
// that importing this module never needs DATABASE_URL (for example at build).

import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import * as schema from "./schema";
import type { Db } from "./types";

let cached: Db | undefined;

export function getDb(): Db {
  if (cached) return cached;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set.");
  // prepare: false keeps it compatible with Neon's pooled (PgBouncer) endpoint.
  const client = postgres(url, { prepare: false, max: 5 });
  cached = drizzle(client, { schema });
  return cached;
}
