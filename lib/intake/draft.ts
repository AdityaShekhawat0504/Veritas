// Memo intake: ask the LLM gateway for a draft and save it as a draft thesis.
// Nothing is tracked until the analyst confirms the draft (confirmExtraction).

import { eq } from "drizzle-orm";
import { indicatorCatalog } from "@/db/schema";
import type { Db } from "@/db/types";
import { ActionError, createThesis, type Actor } from "@/lib/actions";
import { todayUtc } from "@/lib/actions/rules";
import { callStructured, type Gateway } from "@/lib/llm";
import { extractThesisPrompt, filterToCatalog, type Extraction } from "@/lib/llm/prompts/extractThesis";
import { MAX_MEMO_CHARS } from "./text";

export interface DraftExtraction extends Extraction {
  dropped: string[];
  model: string;
  promptVersion: string;
}

export async function activeCatalog(db: Db) {
  return db.select().from(indicatorCatalog).where(eq(indicatorCatalog.active, true)).orderBy(indicatorCatalog.key);
}

export async function draftThesisFromMemo(
  db: Db,
  actor: Actor & { type: "user" },
  gw: Gateway,
  input: { ticker: string; cik?: string | null; memoText: string },
  opts: { now?: Date } = {},
): Promise<{ thesisId: string; draft: DraftExtraction }> {
  const memo = input.memoText.trim();
  if (memo.length === 0) throw new ActionError("VALIDATION", "The memo is empty");
  if (memo.length > MAX_MEMO_CHARS) {
    throw new ActionError("VALIDATION", `The memo is longer than ${MAX_MEMO_CHARS} characters`);
  }
  const today = todayUtc(opts.now);
  const catalog = await activeCatalog(db);
  const result = await callStructured(gw, {
    prompt: extractThesisPrompt,
    input: {
      memo,
      ticker: input.ticker.trim().toUpperCase(),
      today,
      catalog: catalog.map((c) => ({ key: c.key, label: c.label, unit: c.unit, source: c.source })),
    },
    purpose: "extract",
    firmId: actor.firmId,
  });
  const { draft, dropped } = filterToCatalog(result.output, new Set(catalog.map((c) => c.key)), today);
  const stored: DraftExtraction = { ...draft, dropped, model: result.model, promptVersion: result.promptVersion };

  const thesis = await createThesis(db, actor, {
    ticker: input.ticker,
    cik: input.cik || null,
    claim: draft.claim.trim() || `Draft thesis for ${input.ticker.trim().toUpperCase()}`,
    direction: draft.direction,
    horizonMonths: draft.horizonMonths,
    // Placeholder until the analyst sets conviction on the review screen; the
    // draft keeps the model's value (or null) so the form starts from that.
    convictionPct: draft.convictionPct ?? 50,
    memoText: memo,
    draftExtraction: stored,
  });
  return { thesisId: thesis.id, draft: stored };
}
