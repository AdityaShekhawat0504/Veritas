import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseGold } from "@/eval/gold";
import { computeMetrics } from "@/eval/metrics";
import { scoreEntries } from "@/eval/run";

const read = (name: string) => readFileSync(fileURLToPath(new URL(`../eval/gold/${name}`, import.meta.url)), "utf8");

describe("gold-set format", () => {
  it("the shipped gold set parses (it may be empty)", () => {
    const res = parseGold(read("gold.jsonl"), "gold.jsonl");
    expect(res.errors).toEqual([]);
  });

  it("the three example entries parse and are all marked as examples", () => {
    const res = parseGold(read("examples.jsonl"), "examples.jsonl");
    expect(res.errors).toEqual([]);
    expect(res.entries).toHaveLength(3);
    expect(res.entries.every((e) => e.example)).toBe(true);
  });

  it("reports bad lines with their line number", () => {
    const res = parseGold('not json\n{"id":"x"}\n', "bad.jsonl");
    expect(res.errors[0]).toMatch(/bad.jsonl:1: not valid JSON/);
    expect(res.errors.some((e) => e.startsWith("bad.jsonl:2:"))).toBe(true);
  });

  it("refuses a control that expects an alert", () => {
    const line = JSON.stringify({
      id: "c1",
      kind: "numeric",
      control: true,
      company: { ticker: "X", cik: null, name: "X" },
      assumption: { text: "t", falsifiableText: "f", critical: false, category: "other", writtenOn: "2025-01-01" },
      indicator: { catalogKey: "k", operator: "gt", threshold: 1 },
      observation: { value: 0, asOf: "2025-06-30" },
      expectedVerdict: "contradicted",
      answerSource: { url: "https://example.com", description: "d" },
    });
    expect(parseGold(line, "c.jsonl").errors.join(" ")).toMatch(/control cannot expect/);
  });
});

describe("scoring", () => {
  it("scores numeric examples with production code and skips text ones", () => {
    const { entries } = parseGold(read("examples.jsonl"), "examples.jsonl");
    const { scored, skipped } = scoreEntries(entries);
    expect(scored).toHaveLength(2);
    expect(skipped).toHaveLength(1);
    expect(scored.every((s) => s.expected === s.predicted)).toBe(true);
  });

  it("returns n/a (null) metrics on an empty set", () => {
    const m = computeMetrics([]);
    expect(m.scored).toBe(0);
    expect(m.contradictedPrecision).toBeNull();
    expect(m.falseAlertRate).toBeNull();
    expect(m.abstentionRate).toBeNull();
  });

  it("computes precision, false-alert and abstention rates", () => {
    const m = computeMetrics([
      { id: "1", control: false, expected: "contradicted", predicted: "contradicted" },
      { id: "2", control: false, expected: "weakened", predicted: "contradicted" },
      { id: "3", control: true, expected: "supported", predicted: "weakened" },
      { id: "4", control: true, expected: "supported", predicted: "supported" },
      { id: "5", control: false, expected: "supported", predicted: "insufficient_evidence" },
    ]);
    expect(m.contradictedPrecision).toBe(0.5);
    expect(m.falseAlertRate).toBe(0.5);
    expect(m.abstentionRate).toBe(0.2);
    expect(m.accuracy).toBe(0.4);
  });
});
