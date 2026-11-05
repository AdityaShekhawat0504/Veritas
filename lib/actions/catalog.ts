import { indicatorCatalog } from "@/db/schema";
import type { Db } from "@/db/types";
import type { Actor } from "./context";
import { writeLog } from "./log";

export type CatalogItem = Omit<typeof indicatorCatalog.$inferInsert, "id" | "createdAt">;

/**
 * seedIndicatorCatalog: add catalog items that do not exist yet. Existing keys
 * are left untouched so the meaning of past checks never changes.
 */
export async function seedIndicatorCatalog(db: Db, actor: Actor, items: CatalogItem[]) {
  return db.transaction(async (tx) => {
    const created: string[] = [];
    for (const item of items) {
      const rows = await tx
        .insert(indicatorCatalog)
        .values(item)
        .onConflictDoNothing({ target: indicatorCatalog.key })
        .returning({ key: indicatorCatalog.key });
      if (rows.length > 0) created.push(rows[0].key);
    }
    if (created.length > 0) {
      await writeLog(tx, actor, {
        firmId: null,
        action: "seedIndicatorCatalog",
        objectType: "indicator_catalog",
        objectId: null,
        after: { created },
      });
    }
    return { created };
  });
}
