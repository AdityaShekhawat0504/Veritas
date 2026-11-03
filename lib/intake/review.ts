// Review-screen state and the payload sent to confirmExtraction. Pure, so the
// client form and the tests share it. The server re-validates everything.

import type { AssumptionCategory, Direction, Operator } from "@/db/enums";
import { assumptionProblems } from "@/lib/actions/rules";
import type { ConfirmExtractionInput } from "@/lib/actions/schemas";
import type { Extraction } from "@/lib/llm/prompts/extractThesis";

export interface ReviewIndicator {
  catalogKey: string;
  operator: Operator;
  threshold: string;
  breakThreshold: string;
}

export interface ReviewAssumption {
  key: string;
  text: string;
  falsifiableText: string;
  critical: boolean;
  category: AssumptionCategory;
  /** Percent, as typed. */
  probabilityPct: string;
  resolveBy: string;
  indicators: ReviewIndicator[];
}

export interface ReviewKill {
  key: string;
  condition: string;
  indicator: ReviewIndicator | null;
}

export interface ReviewState {
  claim: string;
  direction: Direction;
  horizonMonths: string;
  convictionPct: string;
  assumptions: ReviewAssumption[];
  killCriteria: ReviewKill[];
}

const num = (n: number | null | undefined) => (n === null || n === undefined ? "" : String(n));

export function initialReviewState(
  draft: Extraction | null,
  thesis: { claim: string; direction: Direction; horizonMonths: number },
): ReviewState {
  return {
    claim: draft?.claim || thesis.claim,
    direction: draft?.direction ?? thesis.direction,
    horizonMonths: String(draft?.horizonMonths ?? thesis.horizonMonths),
    // Conviction starts empty unless the memo stated one.
    convictionPct: num(draft?.convictionPct),
    assumptions: (draft?.assumptions ?? []).map((a, i) => ({
      key: `a${i}`,
      text: a.text,
      falsifiableText: a.falsifiableText,
      critical: a.critical,
      category: a.category,
      // Probabilities are never pre-filled: the analyst's own forecast is the point.
      probabilityPct: "",
      resolveBy: a.suggestedResolveBy ?? "",
      indicators: a.suggestedIndicators.map((ind) => ({
        catalogKey: ind.catalogKey,
        operator: ind.operator,
        threshold: num(ind.threshold),
        breakThreshold: num(ind.breakThreshold),
      })),
    })),
    killCriteria: (draft?.killCriteria ?? []).map((k, i) => ({
      key: `k${i}`,
      condition: k.condition,
      indicator: k.suggestedIndicator
        ? {
            catalogKey: k.suggestedIndicator.catalogKey,
            operator: k.suggestedIndicator.operator,
            threshold: num(k.suggestedIndicator.threshold),
            breakThreshold: num(k.suggestedIndicator.breakThreshold),
          }
        : null,
    })),
  };
}

function parseNum(s: string): number | null {
  if (s.trim() === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : Number.NaN;
}

function toSpec(ind: ReviewIndicator, path: string, problems: string[]) {
  const threshold = parseNum(ind.threshold);
  const breakThreshold = parseNum(ind.breakThreshold);
  if (!ind.catalogKey) problems.push(`${path}: pick a catalog indicator`);
  if (threshold === null || Number.isNaN(threshold)) problems.push(`${path}: threshold must be a number`);
  if (Number.isNaN(breakThreshold)) problems.push(`${path}: break threshold must be a number`);
  return {
    catalogKey: ind.catalogKey,
    operator: ind.operator,
    threshold: threshold ?? 0,
    breakThreshold: breakThreshold === null || Number.isNaN(breakThreshold) ? null : breakThreshold,
  };
}

/** Build the confirmExtraction body, or list what the analyst still has to fix. */
export function buildConfirmPayload(
  state: ReviewState,
  today: string,
): { payload: Omit<ConfirmExtractionInput, "thesisId"> | null; problems: string[] } {
  const problems: string[] = [];
  const horizon = Number(state.horizonMonths);
  const conviction = Number(state.convictionPct);
  if (!state.claim.trim()) problems.push("claim is required");
  if (!Number.isInteger(horizon) || horizon < 1 || horizon > 120) problems.push("horizon must be 1-120 months");
  if (state.convictionPct.trim() === "" || !Number.isInteger(conviction) || conviction < 0 || conviction > 100) {
    problems.push("conviction must be a whole number from 0 to 100");
  }
  if (state.assumptions.length === 0) problems.push("add at least one assumption");

  const assumptions = state.assumptions.map((a, i) => {
    const p = parseNum(a.probabilityPct);
    const probability = p === null ? null : Number.isNaN(p) ? Number.NaN : p / 100;
    const item = {
      text: a.text.trim(),
      falsifiableText: a.falsifiableText.trim(),
      critical: a.critical,
      category: a.category,
      probability,
      resolveBy: a.resolveBy || null,
      indicators: a.indicators.map((ind, j) => toSpec(ind, `assumption ${i + 1} indicator ${j + 1}`, problems)),
    };
    for (const msg of assumptionProblems(item, today)) problems.push(`assumption ${i + 1}: ${msg}`);
    return item;
  });
  const killCriteria = state.killCriteria.map((k, i) => {
    if (!k.condition.trim()) problems.push(`kill criterion ${i + 1}: condition is required`);
    return {
      condition: k.condition.trim(),
      indicators: k.indicator ? [toSpec(k.indicator, `kill criterion ${i + 1} indicator`, problems)] : [],
    };
  });

  if (problems.length > 0) return { payload: null, problems };
  return {
    payload: {
      claim: state.claim.trim(),
      direction: state.direction,
      horizonMonths: horizon,
      convictionPct: conviction,
      assumptions,
      killCriteria,
    },
    problems,
  };
}
