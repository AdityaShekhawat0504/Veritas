// Single source of truth for shared domain types.
// String-union types mirror the (untyped) String columns in the Prisma schema.

export type Direction = "long" | "short" | "hold";
export type Conviction = "low" | "medium" | "high";
export type Criticality = "critical" | "supporting";
export type AssumptionStatus = "holding" | "weakening" | "contradicted";

export interface Evidence {
  id: string;
  assumptionId: string;
  text: string;
  source: string | null;
}

export interface Assumption {
  id: string;
  thesisId: string;
  text: string;
  criticality: Criticality;
  status: AssumptionStatus;
  reason: string | null;
  source: string | null;
  lastChecked: Date | null;
  evidence: Evidence[];
}

export interface Decision {
  id: string;
  thesisId: string;
  action: string;
  sizing: string | null;
}

export interface Check {
  id: string;
  thesisId: string;
  score: number;
  createdAt: Date;
}

export interface Thesis {
  id: string;
  actor: string;
  claim: string;
  direction: Direction;
  horizon: string;
  conviction: Conviction;
  integrityScore: number;
  createdAt: Date;
  updatedAt: Date;
}

/** A thesis with the relations the detail page needs. */
export interface ThesisWithRelations extends Thesis {
  assumptions: Assumption[];
  decision: Decision | null;
  checks: Check[];
}

/** A thesis with just enough for a dashboard card. */
export interface ThesisCardData extends Thesis {
  assumptions: Pick<Assumption, "criticality" | "status">[];
}

/** Shape returned by the decompose LLM call (no DB ids yet). */
export interface DecomposedThesis {
  claim: string;
  direction: Direction;
  horizon: string;
  conviction: Conviction;
  decision: { action: string; sizing: string | null };
  assumptions: {
    text: string;
    criticality: Criticality;
    evidence: { text: string; source: string | null }[];
  }[];
}

/** Shape returned by the per-assumption check LLM call. */
export interface CheckResult {
  status: AssumptionStatus;
  reason: string;
  source: string | null;
}
