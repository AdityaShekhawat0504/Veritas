// Minimal SQL migration runner. Applies db/migrations/*.sql in name order, each
// in its own transaction, and records applied files in schema_migrations.
// Works with any driver that can run a multi-statement SQL string.

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

export interface SqlRunner {
  /** Run one or more statements; no result needed. */
  exec(sql: string): Promise<void>;
  /** Return the names of migrations already applied. */
  appliedNames(): Promise<string[]>;
}

export const MIGRATIONS_DIR = fileURLToPath(new URL("./migrations", import.meta.url));

export function listMigrations(dir: string = MIGRATIONS_DIR): { name: string; sql: string }[] {
  return readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((name) => ({ name, sql: readFileSync(join(dir, name), "utf8") }));
}

function quoteLiteral(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

export async function runMigrations(runner: SqlRunner, dir?: string): Promise<string[]> {
  await runner.exec(
    "CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now());",
  );
  const applied = new Set(await runner.appliedNames());
  const ran: string[] = [];
  for (const m of listMigrations(dir)) {
    if (applied.has(m.name)) continue;
    try {
      await runner.exec(
        `BEGIN;\n${m.sql}\n;INSERT INTO schema_migrations (name) VALUES (${quoteLiteral(m.name)});\nCOMMIT;`,
      );
    } catch (err) {
      await runner.exec("ROLLBACK;").catch(() => undefined);
      throw new Error(`Migration ${m.name} failed: ${(err as Error).message}`);
    }
    ran.push(m.name);
  }
  return ran;
}
