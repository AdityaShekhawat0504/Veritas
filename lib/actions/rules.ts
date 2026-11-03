// Pure rule functions used by the action layer. No I/O here, so every rule can
// be unit tested directly. The action layer and the database constraints both
// enforce these; this file is the readable version.

import type { DecisionAction, Operator, Role, Verdict } from "@/db/enums";

// ---------- dates ----------

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** True for a real calendar date written as YYYY-MM-DD. */
export function isIsoDate(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const m = ISO_DATE.exec(value);
  if (!m) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return (
    !Number.isNaN(d.getTime()) &&
    d.getUTCFullYear() === Number(m[1]) &&
    d.getUTCMonth() + 1 === Number(m[2]) &&
    d.getUTCDate() === Number(m[3])
  );
}

/** Today's date in UTC as YYYY-MM-DD. */
export function todayUtc(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

// ---------- assumptions (rule 3) ----------

export interface AssumptionForecastInput {
  text: string;
  falsifiableText: string;
  critical: boolean;
  probability?: number | null;
  resolveBy?: string | null;
}

/**
 * Validate one assumption. Critical assumptions must carry a probability in
 * [0, 1] and a resolution date after `today`. Returns a list of problems
 * (empty when valid).
 */
export function assumptionProblems(a: AssumptionForecastInput, today: string): string[] {
  const problems: string[] = [];
  if (!a.text || a.text.trim().length === 0) problems.push("text is required");
  if (!a.falsifiableText || a.falsifiableText.trim().length === 0) {
    problems.push("falsifiable restatement is required");
  }

  const hasProbability = a.probability !== null && a.probability !== undefined;
  if (hasProbability) {
    const p = a.probability as number;
    if (!Number.isFinite(p) || p < 0 || p > 1) problems.push("probability must be between 0 and 1");
  }

  const hasResolveBy = a.resolveBy !== null && a.resolveBy !== undefined && a.resolveBy !== "";
  if (hasResolveBy) {
    if (!isIsoDate(a.resolveBy)) problems.push("resolve_by must be a date (YYYY-MM-DD)");
    else if ((a.resolveBy as string) <= today) problems.push("resolve_by must be in the future");
  }

  if (a.critical) {
    if (!hasProbability) problems.push("critical assumptions need a probability");
    if (!hasResolveBy) problems.push("critical assumptions need a resolve_by date");
  }
  return problems;
}

// ---------- numeric checks (rule 4) ----------

export function compare(value: number, op: Operator, threshold: number): boolean {
  switch (op) {
    case "gt":
      return value > threshold;
    case "gte":
      return value >= threshold;
    case "lt":
      return value < threshold;
    case "lte":
      return value <= threshold;
  }
}

/**
 * A break threshold must sit on the failing side of the main threshold:
 * below it for gt/gte, above it for lt/lte.
 */
export function breakThresholdProblem(
  op: Operator,
  threshold: number,
  breakThreshold: number | null | undefined,
): string | null {
  if (!Number.isFinite(threshold)) return "threshold must be a number";
  if (breakThreshold === null || breakThreshold === undefined) return null;
  if (!Number.isFinite(breakThreshold)) return "break threshold must be a number";
  const above = op === "gt" || op === "gte";
  if (above && !(breakThreshold < threshold)) {
    return "for gt/gte the break threshold must be below the threshold";
  }
  if (!above && !(breakThreshold > threshold)) {
    return "for lt/lte the break threshold must be above the threshold";
  }
  return null;
}

export interface NumericRule {
  operator: Operator;
  threshold: number;
  breakThreshold?: number | null;
}

/**
 * The numeric verdict, computed in code:
 * - no value: insufficient_evidence
 * - condition met: supported
 * - condition missed but still past the break threshold: weakened
 * - otherwise: contradicted
 */
export function numericVerdict(value: number | null | undefined, rule: NumericRule): Verdict {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return "insufficient_evidence";
  }
  if (compare(value, rule.operator, rule.threshold)) return "supported";
  const b = rule.breakThreshold;
  if (b !== null && b !== undefined && compare(value, rule.operator, b)) return "weakened";
  return "contradicted";
}

// ---------- text checks (rule 5) ----------

/** Shortest quote accepted as evidence, after normalisation. */
export const MIN_QUOTE_LENGTH = 20;

/**
 * Normalise text for quote matching. Only layout is forgiven: runs of
 * whitespace become one space and typographic quotes and dashes become ASCII.
 * Words, numbers, punctuation and case must match exactly.
 */
export function normalizeForQuote(s: string): string {
  return s
    .replace(/[‘’‚′]/g, "'")
    .replace(/[“”„″]/g, '"')
    .replace(/[–—−]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

export function quoteAppearsIn(documentText: string, quote: string): boolean {
  const q = normalizeForQuote(quote);
  if (q.length < MIN_QUOTE_LENGTH) return false;
  return normalizeForQuote(documentText).includes(q);
}

export interface TextVerdictInput {
  proposed: Verdict;
  quote: string | null | undefined;
  documentText: string | null | undefined;
}

/**
 * The model proposes; code decides. A verdict other than
 * insufficient_evidence survives only when its quote is found verbatim in the
 * stored document.
 */
export function resolveTextVerdict(input: TextVerdictInput): {
  verdict: Verdict;
  quoteVerified: boolean;
} {
  if (input.proposed === "insufficient_evidence") {
    return { verdict: "insufficient_evidence", quoteVerified: false };
  }
  if (!input.quote || !input.documentText) {
    return { verdict: "insufficient_evidence", quoteVerified: false };
  }
  if (!quoteAppearsIn(input.documentText, input.quote)) {
    return { verdict: "insufficient_evidence", quoteVerified: false };
  }
  return { verdict: input.proposed, quoteVerified: true };
}

/** Every verdict except insufficient_evidence needs at least one evidence row. */
export function evidenceProblem(verdict: Verdict, evidenceCount: number): string | null {
  if (verdict !== "insufficient_evidence" && evidenceCount < 1) {
    return `${verdict} needs at least one evidence row`;
  }
  return null;
}

// ---------- alerts (rule 8) ----------

/**
 * An alert fires only when the verdict differs from the previous one. With no
 * previous check, only a weakened or contradicted verdict counts as a change
 * worth an alert (a first "supported" or "insufficient_evidence" is not news).
 */
export function shouldAlert(previous: Verdict | null, next: Verdict): boolean {
  if (previous === null) return next === "weakened" || next === "contradicted";
  return previous !== next;
}

// ---------- roles ----------

export function canWrite(role: Role): boolean {
  return role !== "viewer";
}

export function canOverride(role: Role): boolean {
  return role === "admin" || role === "pm";
}

// ---------- decisions ----------

/**
 * Validate a decision and return the position size after it. Sizes are in
 * percent of the portfolio.
 */
export function applyDecision(
  action: DecisionAction,
  currentSizePct: number,
  sizeChangePct: number,
): { sizeAfterPct: number; sizeChangePct: number } | { problem: string } {
  if (!Number.isFinite(sizeChangePct)) return { problem: "size change must be a number" };
  switch (action) {
    case "add":
      if (sizeChangePct <= 0) return { problem: "add needs a positive size change" };
      break;
    case "trim":
      if (sizeChangePct >= 0) return { problem: "trim needs a negative size change" };
      if (currentSizePct + sizeChangePct < 0) return { problem: "trim is larger than the position" };
      break;
    case "hold":
      if (sizeChangePct !== 0) return { problem: "hold must not change the size" };
      break;
    case "exit":
      return { sizeAfterPct: 0, sizeChangePct: -currentSizePct };
  }
  const after = currentSizePct + sizeChangePct;
  if (after > 100) return { problem: "position size cannot exceed 100%" };
  return { sizeAfterPct: round6(after), sizeChangePct };
}

function round6(n: number): number {
  return Math.round(n * 1e6) / 1e6;
}

// ---------- forecasts ----------

/** Brier score for one binary forecast. Ambiguous outcomes are not scored. */
export function brierScore(probability: number, result: "true" | "false" | "ambiguous"): number | null {
  if (result === "ambiguous") return null;
  const o = result === "true" ? 1 : 0;
  return (probability - o) ** 2;
}
