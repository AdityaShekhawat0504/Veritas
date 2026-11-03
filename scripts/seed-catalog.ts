// Seed indicator_catalog with lib/data/catalog.ts. Safe to run again: existing
// keys are left as they are.
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import * as schema from "../db/schema";
import type { Db } from "../db/types";
import { seedIndicatorCatalog, systemActor } from "../lib/actions";
import { INDICATOR_CATALOG } from "../lib/data/catalog";

async function main(): Promise<void> {
  const url = process.env.DIRECT_URL || process.env.DATABASE_URL;
  if (!url) throw new Error("Set DIRECT_URL or DATABASE_URL.");
  const client = postgres(url, { max: 1, prepare: false });
  try {
    const db = drizzle(client, { schema }) as unknown as Db;
    const { created } = await seedIndicatorCatalog(db, systemActor("seed-catalog"), INDICATOR_CATALOG);
    console.log(`Catalog: ${created.length} new, ${INDICATOR_CATALOG.length - created.length} already present.`);
  } finally {
    await client.end();
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
