// Apply db/migrations to the database in DATABASE_URL (use the direct, not
// pooled, Neon connection string if migrations time out on the pooler).
import postgres from "postgres";
import { runMigrations } from "../db/migrate";

async function main(): Promise<void> {
  const url = process.env.DIRECT_URL || process.env.DATABASE_URL;
  if (!url) throw new Error("Set DIRECT_URL or DATABASE_URL.");
  const sql = postgres(url, { max: 1, prepare: false });
  try {
    const ran = await runMigrations({
      exec: async (text) => {
        await sql.unsafe(text).simple();
      },
      appliedNames: async () => {
        const rows = await sql.unsafe("SELECT name FROM schema_migrations");
        return rows.map((r) => String(r.name));
      },
    });
    console.log(ran.length ? `Applied: ${ran.join(", ")}` : "Database is up to date.");
  } finally {
    await sql.end();
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
