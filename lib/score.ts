// Integrity score — a PURE function. No I/O, no imports beyond types.
// Per assumption: holding = 1.0, weakening = 0.5, contradicted = 0.0.
// Weight by criticality: critical = 2, supporting = 1.
// Score = round( 100 * sum(statusValue * weight) / sum(weight) ).

import type { AssumptionStatus, Criticality } from "./types";

const STATUS_VALUE: Record<AssumptionStatus, number> = {
  holding: 1.0,
  weakening: 0.5,
  contradicted: 0.0,
};

const CRITICALITY_WEIGHT: Record<Criticality, number> = {
  critical: 2,
  supporting: 1,
};

export interface ScorableAssumption {
  criticality: Criticality;
  status: AssumptionStatus;
}

/**
 * Compute the thesis-integrity score (0–100) from its assumptions.
 * An empty set scores 100 (nothing has broken yet).
 */
export function computeIntegrityScore(assumptions: ScorableAssumption[]): number {
  if (assumptions.length === 0) return 100;

  let weightedValue = 0;
  let totalWeight = 0;

  for (const a of assumptions) {
    const weight = CRITICALITY_WEIGHT[a.criticality];
    weightedValue += STATUS_VALUE[a.status] * weight;
    totalWeight += weight;
  }

  return Math.round((100 * weightedValue) / totalWeight);
}

/** True if any *critical* assumption is contradicted (drives the dashboard red flag). */
export function hasContradictedCritical(assumptions: ScorableAssumption[]): boolean {
  return assumptions.some((a) => a.criticality === "critical" && a.status === "contradicted");
}

export type IntegrityBand = "high" | "medium" | "low";

/** Bucket a score for color/threshold decisions. */
export function integrityBand(score: number): IntegrityBand {
  if (score >= 80) return "high";
  if (score >= 60) return "medium";
  return "low";
}

/**
 * Conviction-vs-integrity mismatch detection for the detail-page banner.
 * - high conviction but the thesis is no longer intact → overconfident
 * - low conviction but the thesis is fully intact → overcautious
 */
export function convictionMismatch(
  conviction: "low" | "medium" | "high",
  score: number,
): { kind: "overconfident" | "overcautious"; message: string } | null {
  if (conviction === "high" && score < 70) {
    return {
      kind: "overconfident",
      message: `High conviction, but only ${score}% intact — the stated confidence is out of line with the evidence.`,
    };
  }
  if (conviction === "low" && score >= 85) {
    return {
      kind: "overcautious",
      message: `Low conviction, but ${score}% intact — the thesis is holding up better than the stated confidence suggests.`,
    };
  }
  return null;
}
