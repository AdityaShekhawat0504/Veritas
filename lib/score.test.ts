import { describe, it, expect } from "vitest";
import {
  computeIntegrityScore,
  hasContradictedCritical,
  integrityBand,
  convictionMismatch,
} from "./score";
import type { ScorableAssumption } from "./score";

const a = (
  criticality: ScorableAssumption["criticality"],
  status: ScorableAssumption["status"],
): ScorableAssumption => ({ criticality, status });

describe("computeIntegrityScore", () => {
  it("returns 100 for no assumptions", () => {
    expect(computeIntegrityScore([])).toBe(100);
  });

  it("returns 100 when everything holds", () => {
    expect(
      computeIntegrityScore([a("critical", "holding"), a("supporting", "holding")]),
    ).toBe(100);
  });

  it("returns 0 when everything is contradicted", () => {
    expect(computeIntegrityScore([a("critical", "contradicted")])).toBe(0);
  });

  it("weights critical assumptions twice as heavily as supporting", () => {
    // critical contradicted (0*2) + supporting holding (1*1) => 1/3 => 33
    expect(
      computeIntegrityScore([a("critical", "contradicted"), a("supporting", "holding")]),
    ).toBe(33);
  });

  it("a contradicted critical tanks the score (the demo moment)", () => {
    // matches the seeded Tesla thesis: 4 assumptions => 57
    const score = computeIntegrityScore([
      a("critical", "contradicted"),
      a("critical", "weakening"),
      a("critical", "holding"),
      a("supporting", "holding"),
    ]);
    expect(score).toBe(57);
  });

  it("scores weakening as half", () => {
    expect(computeIntegrityScore([a("supporting", "weakening")])).toBe(50);
  });
});

describe("hasContradictedCritical", () => {
  it("is true only when a critical assumption is contradicted", () => {
    expect(hasContradictedCritical([a("critical", "contradicted")])).toBe(true);
    expect(hasContradictedCritical([a("supporting", "contradicted")])).toBe(false);
    expect(hasContradictedCritical([a("critical", "weakening")])).toBe(false);
  });
});

describe("integrityBand", () => {
  it("buckets scores", () => {
    expect(integrityBand(95)).toBe("high");
    expect(integrityBand(80)).toBe("high");
    expect(integrityBand(70)).toBe("medium");
    expect(integrityBand(60)).toBe("medium");
    expect(integrityBand(57)).toBe("low");
  });
});

describe("convictionMismatch", () => {
  it("flags high conviction with a broken thesis as overconfident", () => {
    expect(convictionMismatch("high", 57)?.kind).toBe("overconfident");
  });

  it("flags low conviction with an intact thesis as overcautious", () => {
    expect(convictionMismatch("low", 100)?.kind).toBe("overcautious");
  });

  it("returns null when conviction and integrity are aligned", () => {
    expect(convictionMismatch("medium", 83)).toBeNull();
    expect(convictionMismatch("high", 90)).toBeNull();
  });
});
