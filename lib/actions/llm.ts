import { llmCalls } from "@/db/schema";
import type { Db } from "@/db/types";
import { systemActor } from "./context";
import { writeLog } from "./log";

export type LlmCallRecord = Omit<typeof llmCalls.$inferInsert, "id" | "createdAt">;

/** recordLlmCall: store model, prompt version, tokens and cost of one LLM call. */
export async function recordLlmCall(db: Db, record: LlmCallRecord) {
  return db.transaction(async (tx) => {
    const row = (await tx.insert(llmCalls).values(record).returning())[0];
    await writeLog(tx, systemActor("llm-gateway"), {
      firmId: record.firmId ?? null,
      action: "recordLlmCall",
      objectType: "llm_call",
      objectId: row.id,
      after: {
        purpose: row.purpose,
        model: row.model,
        promptVersion: row.promptVersion,
        inputTokens: row.inputTokens,
        outputTokens: row.outputTokens,
        costUsd: row.costUsd,
        ok: row.ok,
      },
    });
    return row;
  });
}
