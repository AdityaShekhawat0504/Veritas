import { describe, expect, it } from "vitest";
import { extractThesisPrompt, filterToCatalog } from "@/lib/llm/prompts/extractThesis";
import { buildConfirmPayload, initialReviewState } from "@/lib/intake/review";
import { SAMPLE_EXTRACTION } from "./helpers/extraction";

const TODAY = "2026-01-15";


describe("extract-thesis prompt", () => {
  it("has a version string and a strict schema (every object lists all its properties as required)", () => {
    expect(extractThesisPrompt.version).toMatch(/^extract-thesis@\d+$/);
    const walk = (node: unknown): void => {
      if (!node || typeof node !== "object") return;
      const n = node as Record<string, unknown>;
      if (n.type === "object" && n.properties) {
        expect(n.additionalProperties).toBe(false);
        expect([...(n.required as string[])].sort()).toEqual(Object.keys(n.properties as object).sort());
      }
      for (const v of Object.values(n)) walk(v);
    };
    walk(extractThesisPrompt.jsonSchema);
  });

  it("renders the catalog and the memo into the user message", () => {
    const text = extractThesisPrompt.render({
      memo: "  memo body  ",
      ticker: "EXMP",
      today: TODAY,
      catalog: [{ key: "fed_funds_rate", label: "Fed funds", unit: "%", source: "fred" }],
    });
    expect(text).toContain("- fed_funds_rate: Fed funds (%, fred)");
    expect(text).toContain("memo body");
  });

  it("rejects malformed model output", () => {
    let threw = false;
    try {
      extractThesisPrompt.parse({ claim: "x" });
    } catch {
      threw = true;
    }
    expect(threw).toBe(true);
  });
});

describe("rule 6: suggestions are limited to the catalog", () => {
  it("drops unknown indicators and past dates and says so", () => {
    const { draft, dropped } = filterToCatalog(SAMPLE_EXTRACTION, new Set(["revenue_yoy_pct_q"]), TODAY);
    expect(draft.assumptions[0].suggestedIndicators.map((i) => i.catalogKey)).toEqual(["revenue_yoy_pct_q"]);
    expect(draft.assumptions[1].suggestedResolveBy).toBeNull();
    expect(draft.killCriteria[0].suggestedIndicator).toBeNull();
    expect(dropped).toHaveLength(3);
  });
});

describe("review screen", () => {
  const { draft } = filterToCatalog(SAMPLE_EXTRACTION, new Set(["revenue_yoy_pct_q"]), TODAY);
  const thesis = { claim: "fallback", direction: "long" as const, horizonMonths: 12 };

  it("never pre-fills probabilities and leaves conviction empty when the memo gave none", () => {
    const s = initialReviewState(draft, thesis);
    expect(s.assumptions.map((a) => a.probabilityPct)).toEqual(["", ""]);
    expect(s.convictionPct).toBe("");
  });

  it("rule 3: will not build a payload until critical assumptions have probability and date", () => {
    const s = initialReviewState(draft, thesis);
    s.convictionPct = "65";
    const first = buildConfirmPayload(s, TODAY);
    expect(first.payload).toBeNull();
    expect(first.problems).toContain("assumption 1: critical assumptions need a probability");

    s.assumptions[0].probabilityPct = "70";
    const second = buildConfirmPayload(s, TODAY);
    expect(second.problems).toEqual([]);
    expect(second.payload?.assumptions[0].probability).toBe(0.7);
    expect(second.payload?.convictionPct).toBe(65);
  });

  it("flags bad numbers in indicators", () => {
    const s = initialReviewState(draft, thesis);
    s.convictionPct = "50";
    s.assumptions[0].probabilityPct = "70";
    s.assumptions[0].indicators[0].threshold = "ten";
    expect(buildConfirmPayload(s, TODAY).problems.join(" ")).toMatch(/threshold must be a number/);
  });
});
