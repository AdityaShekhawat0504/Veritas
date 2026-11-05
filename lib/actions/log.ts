import { actionLog } from "@/db/schema";
import type { Tx } from "@/db/types";
import type { Actor } from "./context";

export interface LogEntry {
  firmId: string | null;
  action: string;
  objectType: string;
  objectId: string | null;
  before?: unknown;
  after?: unknown;
}

/** Make a value safe for jsonb (Dates become ISO strings, undefined is dropped). */
export function toJson(value: unknown): unknown {
  if (value === undefined) return null;
  return JSON.parse(JSON.stringify(value)) as unknown;
}

/**
 * Append one row to action_log. Must be called with the same transaction as
 * the write it describes, so both commit or neither does.
 */
export async function writeLog(tx: Tx, actor: Actor, entry: LogEntry): Promise<void> {
  await tx.insert(actionLog).values({
    firmId: entry.firmId,
    actorType: actor.type,
    actorId: actor.type === "user" ? actor.userId : null,
    actorName: actor.type === "system" ? actor.name : null,
    action: entry.action,
    objectType: entry.objectType,
    objectId: entry.objectId,
    before: toJson(entry.before ?? null),
    after: toJson(entry.after ?? null),
  });
}
