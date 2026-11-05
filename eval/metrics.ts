import type { Verdict } from "../db/enums";

export interface Scored {
  id: string;
  control: boolean;
  expected: Verdict;
  predicted: Verdict;
}

export interface Metrics {
  scored: number;
  accuracy: number | null;
  /** Of all predicted "contradicted", the share that were truly contradicted. */
  contradictedPrecision: number | null;
  contradictedRecall: number | null;
  /** Share of controls that got a weakened or contradicted verdict. */
  falseAlertRate: number | null;
  /** Share of scored entries where the system said insufficient_evidence. */
  abstentionRate: number | null;
  counts: {
    predictedContradicted: number;
    expectedContradicted: number;
    truePositiveContradicted: number;
    controls: number;
    falseAlerts: number;
    abstentions: number;
  };
}

const ratio = (num: number, den: number): number | null => (den === 0 ? null : num / den);

export function computeMetrics(rows: Scored[]): Metrics {
  const correct = rows.filter((r) => r.expected === r.predicted).length;
  const predC = rows.filter((r) => r.predicted === "contradicted");
  const expC = rows.filter((r) => r.expected === "contradicted");
  const tpC = predC.filter((r) => r.expected === "contradicted").length;
  const controls = rows.filter((r) => r.control);
  const falseAlerts = controls.filter((r) => r.predicted === "weakened" || r.predicted === "contradicted").length;
  const abstentions = rows.filter((r) => r.predicted === "insufficient_evidence").length;
  return {
    scored: rows.length,
    accuracy: ratio(correct, rows.length),
    contradictedPrecision: ratio(tpC, predC.length),
    contradictedRecall: ratio(tpC, expC.length),
    falseAlertRate: ratio(falseAlerts, controls.length),
    abstentionRate: ratio(abstentions, rows.length),
    counts: {
      predictedContradicted: predC.length,
      expectedContradicted: expC.length,
      truePositiveContradicted: tpC,
      controls: controls.length,
      falseAlerts,
      abstentions,
    },
  };
}

export function fmt(x: number | null): string {
  return x === null ? "n/a" : x.toFixed(3);
}
