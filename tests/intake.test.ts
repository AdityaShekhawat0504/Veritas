import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { asc, eq, inArray } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { actionLog, llmCalls, theses } from "@/db/schema";
import { confirmExtraction } from "@/lib/actions";
import { draftThesisFromMemo } from "@/lib/intake/draft";
import { buildConfirmPayload, initialReviewState } from "@/lib/intake/review";
import { extractMemoText } from "@/lib/intake/text";
import { createMockProvider, type Gateway } from "@/lib/llm";
import { dbLogger } from "@/lib/llm/env";
import { NOW, createWorld } from "./helpers/db";
import { SAMPLE_EXTRACTION } from "./helpers/extraction";

const fixture = (name: string) => new Uint8Array(readFileSync(fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url))));

describe("memo text extraction", () => {
  it("reads plain text", async () => {
    const text = await extractMemoText({ name: "m.txt", type: "text/plain", bytes: new TextEncoder().encode(" hello\r\nworld ") });
    expect(text).toBe("hello\nworld");
  });
  it("reads a PDF", async () => {
    const text = await extractMemoText({ name: "memo.pdf", type: "application/pdf", bytes: fixture("memo.pdf") });
    expect(text).toContain("Revenue grows at least 10% year on year");
  });
  it("reads a DOCX", async () => {
    const text = await extractMemoText({ name: "memo.docx", type: "", bytes: fixture("memo.docx") });
    expect(text).toContain("Revenue grows at least 10% year on year");
  });
  it("refuses other files", async () => {
    let msg = "";
    try {
      await extractMemoText({ name: "x.xlsx", type: "application/octet-stream", bytes: new Uint8Array() });
    } catch (e) {
      msg = (e as Error).message;
    }
    expect(msg).toMatch(/PDF, DOCX/);
  });
});

describe("Phase 1 flow: memo to confirmed thesis", () => {
  it("drafts with the mock model, then the analyst confirms; action_log shows each step", async () => {
    const w = await createWorld();
    const provider = createMockProvider(() => SAMPLE_EXTRACTION, { model: "mock-extractor" });
    const gw: Gateway = { provider, models: { default: "m" }, prices: null, log: dbLogger(w.db) };

    const { thesisId, draft } = await draftThesisFromMemo(
      w.db,
      w.analyst,
      gw,
      { ticker: "exmp", memoText: "Example memo (test fixture). Revenue grows 10%+." },
      { now: NOW },
    );
    // Rule 6: the invented catalog key never reaches the draft.
    expect(draft.dropped.length).toBeGreaterThan(0);
    expect(provider.calls[0].user).toContain("revenue_yoy_pct_q");

    const t = (await w.db.select().from(theses).where(eq(theses.id, thesisId)))[0];
    expect(t.status).toBe("draft");

    const calls = await w.db.select().from(llmCalls);
    expect(calls).toHaveLength(1);
    expect(calls[0].promptVersion).toBe("extract-thesis@1");
    expect(calls[0].model).toBe("mock-extractor");
    expect(calls[0].costUsd).toBeNull();

    const state = initialReviewState(draft, { claim: t.claim, direction: t.direction, horizonMonths: t.horizonMonths });
    state.convictionPct = "60";
    state.assumptions[0].probabilityPct = "70";
    const { payload, problems } = buildConfirmPayload(state, "2026-01-15");
    expect(problems).toEqual([]);
    if (!payload) throw new Error("no payload");
    const snap = await confirmExtraction(w.db, w.analyst, { ...payload, thesisId }, { now: NOW });
    expect(snap.thesis.status).toBe("open");
    expect(snap.thesis.convictionPct).toBe(60);
    expect(snap.assumptions[0].probability).toBe(0.7);

    const log = await w.db
      .select()
      .from(actionLog)
      .where(inArray(actionLog.action, ["recordLlmCall", "createThesis", "confirmExtraction"]))
      .orderBy(asc(actionLog.seq));
    expect(log.map((l) => l.action)).toEqual(["recordLlmCall", "createThesis", "confirmExtraction"]);
  });
});
