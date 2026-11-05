import { describe, expect, it } from "vitest";
import {
  applyDecision,
  assumptionProblems,
  breakThresholdProblem,
  brierScore,
  canOverride,
  canWrite,
  evidenceProblem,
  isIsoDate,
  normalizeForQuote,
  numericVerdict,
  quoteAppearsIn,
  resolveTextVerdict,
  shouldAlert,
} from "@/lib/actions/rules";

const TODAY = "2026-01-15";
const base = { text: "Revenue grows", falsifiableText: "Revenue grows at least 10% y/y" };

describe("isIsoDate", () => {
  it("accepts real dates and rejects others", () => {
    expect(isIsoDate("2026-02-28")).toBe(true);
    expect(isIsoDate("2026-02-30")).toBe(false);
    expect(isIsoDate("2026-2-3")).toBe(false);
    expect(isIsoDate(20260101)).toBe(false);
  });
});

describe("rule 3: critical assumptions need probability and resolve_by", () => {
  it("accepts a complete critical assumption", () => {
    expect(assumptionProblems({ ...base, critical: true, probability: 0.6, resolveBy: "2026-12-31" }, TODAY)).toEqual([]);
  });
  it("rejects a critical assumption without probability", () => {
    expect(assumptionProblems({ ...base, critical: true, resolveBy: "2026-12-31" }, TODAY)).toContain(
      "critical assumptions need a probability",
    );
  });
  it("rejects a critical assumption without resolve_by", () => {
    expect(assumptionProblems({ ...base, critical: true, probability: 0.6, resolveBy: null }, TODAY)).toContain(
      "critical assumptions need a resolve_by date",
    );
  });
  it("rejects probability outside [0, 1]", () => {
    expect(assumptionProblems({ ...base, critical: true, probability: 1.2, resolveBy: "2026-12-31" }, TODAY)).toContain(
      "probability must be between 0 and 1",
    );
  });
  it("rejects a resolve_by in the past or today", () => {
    expect(assumptionProblems({ ...base, critical: true, probability: 0.5, resolveBy: TODAY }, TODAY)).toContain(
      "resolve_by must be in the future",
    );
  });
  it("lets supporting assumptions skip the forecast", () => {
    expect(assumptionProblems({ ...base, critical: false }, TODAY)).toEqual([]);
  });
  it("requires a falsifiable restatement", () => {
    expect(assumptionProblems({ ...base, falsifiableText: " ", critical: false }, TODAY)).toContain(
      "falsifiable restatement is required",
    );
  });
});

describe("rule 4: numeric verdicts are computed in code", () => {
  const rule = { operator: "gte" as const, threshold: 10, breakThreshold: 5 };
  it("supported when the condition holds", () => expect(numericVerdict(12, rule)).toBe("supported"));
  it("supported on the boundary for gte", () => expect(numericVerdict(10, rule)).toBe("supported"));
  it("weakened between threshold and break threshold", () => expect(numericVerdict(7, rule)).toBe("weakened"));
  it("contradicted past the break threshold", () => expect(numericVerdict(4, rule)).toBe("contradicted"));
  it("contradicted on any miss without a break threshold", () =>
    expect(numericVerdict(9.9, { operator: "gte", threshold: 10 })).toBe("contradicted"));
  it("insufficient_evidence with no value", () => {
    expect(numericVerdict(null, rule)).toBe("insufficient_evidence");
    expect(numericVerdict(Number.NaN, rule)).toBe("insufficient_evidence");
  });
  it("handles lt operators", () => {
    const lt = { operator: "lt" as const, threshold: 3, breakThreshold: 4 };
    expect(numericVerdict(2.5, lt)).toBe("supported");
    expect(numericVerdict(3.5, lt)).toBe("weakened");
    expect(numericVerdict(4.5, lt)).toBe("contradicted");
  });
  it("checks the break threshold is on the failing side", () => {
    expect(breakThresholdProblem("gte", 10, 5)).toBeNull();
    expect(breakThresholdProblem("gte", 10, 12)).toMatch(/below/);
    expect(breakThresholdProblem("lt", 3, 2)).toMatch(/above/);
    expect(breakThresholdProblem("lt", 3, null)).toBeNull();
  });
});

describe("rule 5: text verdicts must cite a verbatim quote", () => {
  const doc = "Net revenue increased 14% year over year, driven by   data center demand.\nGross margin was 61%.";
  it("normalises only layout", () => {
    expect(normalizeForQuote("a’b  \n c—d")).toBe("a'b c-d");
  });
  it("finds a quote across line breaks and extra spaces", () => {
    expect(quoteAppearsIn(doc, "increased 14% year over year, driven by data center demand.")).toBe(true);
  });
  it("rejects a paraphrase or changed number", () => {
    expect(quoteAppearsIn(doc, "Net revenue increased 15% year over year")).toBe(false);
    expect(quoteAppearsIn(doc, "net revenue increased 14% year over year")).toBe(false);
  });
  it("rejects quotes that are too short to mean anything", () => {
    expect(quoteAppearsIn(doc, "Gross margin")).toBe(false);
  });
  it("keeps a verdict whose quote is found", () => {
    expect(
      resolveTextVerdict({ proposed: "contradicted", quote: "Gross margin was 61%.", documentText: doc }),
    ).toEqual({ verdict: "contradicted", quoteVerified: true });
  });
  it("downgrades to insufficient_evidence when the quote is missing or not found", () => {
    expect(resolveTextVerdict({ proposed: "contradicted", quote: null, documentText: doc }).verdict).toBe(
      "insufficient_evidence",
    );
    expect(
      resolveTextVerdict({ proposed: "supported", quote: "Revenue fell sharply in the quarter", documentText: doc }),
    ).toEqual({ verdict: "insufficient_evidence", quoteVerified: false });
    expect(resolveTextVerdict({ proposed: "weakened", quote: "Gross margin was 61%.", documentText: null }).verdict).toBe(
      "insufficient_evidence",
    );
  });
  it("needs evidence for every real verdict", () => {
    expect(evidenceProblem("contradicted", 0)).toMatch(/evidence/);
    expect(evidenceProblem("supported", 0)).toMatch(/evidence/);
    expect(evidenceProblem("contradicted", 1)).toBeNull();
    expect(evidenceProblem("insufficient_evidence", 0)).toBeNull();
  });
});

describe("rule 8: alerts only on verdict change", () => {
  it("no alert when the verdict repeats", () => expect(shouldAlert("weakened", "weakened")).toBe(false));
  it("alert when the verdict changes", () => expect(shouldAlert("supported", "weakened")).toBe(true));
  it("first check alerts only on bad news", () => {
    expect(shouldAlert(null, "supported")).toBe(false);
    expect(shouldAlert(null, "insufficient_evidence")).toBe(false);
    expect(shouldAlert(null, "contradicted")).toBe(true);
  });
});

describe("roles", () => {
  it("viewers cannot write; only PMs and admins override", () => {
    expect(canWrite("viewer")).toBe(false);
    expect(canWrite("analyst")).toBe(true);
    expect(canOverride("analyst")).toBe(false);
    expect(canOverride("pm")).toBe(true);
  });
});

describe("decisions", () => {
  it("add, trim, hold and exit", () => {
    expect(applyDecision("add", 2, 1)).toEqual({ sizeAfterPct: 3, sizeChangePct: 1 });
    expect(applyDecision("trim", 3, -1)).toEqual({ sizeAfterPct: 2, sizeChangePct: -1 });
    expect(applyDecision("hold", 3, 0)).toEqual({ sizeAfterPct: 3, sizeChangePct: 0 });
    expect(applyDecision("exit", 3, 0)).toEqual({ sizeAfterPct: 0, sizeChangePct: -3 });
  });
  it("rejects inconsistent sizes", () => {
    expect(applyDecision("add", 2, -1)).toHaveProperty("problem");
    expect(applyDecision("trim", 1, -2)).toHaveProperty("problem");
    expect(applyDecision("hold", 1, 0.5)).toHaveProperty("problem");
    expect(applyDecision("add", 99, 2)).toHaveProperty("problem");
  });
});

describe("brierScore", () => {
  it("scores binary outcomes and skips ambiguous", () => {
    expect(brierScore(0.8, "true")).toBeCloseTo(0.04);
    expect(brierScore(0.8, "false")).toBeCloseTo(0.64);
    expect(brierScore(0.8, "ambiguous")).toBeNull();
  });
});
