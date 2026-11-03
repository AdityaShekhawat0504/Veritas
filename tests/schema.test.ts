import { beforeAll, describe, expect, it } from "vitest";
import { getTableConfig, type PgTable } from "drizzle-orm/pg-core";
import type { PGlite } from "@electric-sql/pglite";
import * as schema from "@/db/schema";
import { runMigrations } from "@/db/migrate";
import { createTestDb } from "./helpers/db";

// The SQL migrations and db/schema.ts are written by hand. This test fails if
// they drift apart: every Drizzle column must exist in the migrated database
// with the same nullability.

const tables = Object.values(schema) as PgTable[];

let client: PGlite;

beforeAll(async () => {
  client = (await createTestDb()).client;
});

describe("schema and migrations", () => {
  it("defines every table from the ontology", () => {
    const names = tables.map((t) => getTableConfig(t).name).sort();
    for (const required of [
      "firms",
      "users",
      "memberships",
      "securities",
      "theses",
      "thesis_versions",
      "positions",
      "assumptions",
      "indicator_catalog",
      "indicators",
      "events",
      "evidence",
      "checks",
      "kill_criteria",
      "decisions",
      "outcomes",
      "action_log",
    ]) {
      expect(names).toContain(required);
    }
  });

  it.each(tables.map((t) => [getTableConfig(t).name, t] as const))("%s matches the migration", async (name, table) => {
    const res = await client.query<{ column_name: string; is_nullable: string }>(
      "SELECT column_name, is_nullable FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1",
      [name],
    );
    const dbCols = new Map(res.rows.map((r) => [r.column_name, r.is_nullable === "YES"]));
    expect(dbCols.size).toBeGreaterThan(0);
    const cfg = getTableConfig(table);
    for (const col of cfg.columns) {
      expect(dbCols.has(col.name), `${name}.${col.name} missing in SQL`).toBe(true);
      expect(dbCols.get(col.name), `${name}.${col.name} nullability`).toBe(!col.notNull);
    }
    expect(cfg.columns.length, `${name} has columns in SQL that Drizzle does not know`).toBe(dbCols.size);
  });

  it("is idempotent: running migrations again applies nothing", async () => {
    const ran = await runMigrations({
      exec: async (sql) => {
        await client.exec(sql);
      },
      appliedNames: async () => (await client.query<{ name: string }>("SELECT name FROM schema_migrations")).rows.map((r) => r.name),
    });
    expect(ran).toEqual([]);
  });
});
