// Closed value sets shared by the Drizzle schema, the SQL migration CHECK
// constraints and the action layer. Keep these in sync with db/migrations.

export const ROLES = ["admin", "pm", "analyst", "viewer"] as const;
export type Role = (typeof ROLES)[number];

export const DIRECTIONS = ["long", "short"] as const;
export type Direction = (typeof DIRECTIONS)[number];

export const THESIS_STATUSES = ["draft", "open", "closed"] as const;
export type ThesisStatus = (typeof THESIS_STATUSES)[number];

export const ASSUMPTION_CATEGORIES = [
  "revenue",
  "margin",
  "earnings",
  "cash_flow",
  "balance_sheet",
  "macro",
  "competition",
  "product",
  "management",
  "regulatory",
  "valuation",
  "other",
] as const;
export type AssumptionCategory = (typeof ASSUMPTION_CATEGORIES)[number];

export const ASSUMPTION_STATUSES = ["active", "retired", "resolved"] as const;
export type AssumptionStatus = (typeof ASSUMPTION_STATUSES)[number];

export const VERDICTS = [
  "supported",
  "weakened",
  "contradicted",
  "insufficient_evidence",
] as const;
export type Verdict = (typeof VERDICTS)[number];

export const CHECK_KINDS = ["numeric", "text", "override"] as const;
export type CheckKind = (typeof CHECK_KINDS)[number];

export const CHECK_TRIGGERS = ["event", "sweep", "manual", "override"] as const;
export type CheckTrigger = (typeof CHECK_TRIGGERS)[number];

export const OPERATORS = ["gt", "gte", "lt", "lte"] as const;
export type Operator = (typeof OPERATORS)[number];

export const CATALOG_SOURCES = ["xbrl", "fred", "price"] as const;
export type CatalogSource = (typeof CATALOG_SOURCES)[number];

export const CATALOG_TRANSFORMS = [
  "level",
  "yoy_pct",
  "ratio_pct",
  "return_from_entry_pct",
  "drawdown_from_high_pct",
] as const;
export type CatalogTransform = (typeof CATALOG_TRANSFORMS)[number];

export const CATALOG_FREQUENCIES = [
  "quarterly",
  "annual",
  "instant",
  "daily",
  "monthly",
] as const;
export type CatalogFrequency = (typeof CATALOG_FREQUENCIES)[number];

export const EVENT_KINDS = ["filing", "macro_release", "price_move"] as const;
export type EventKind = (typeof EVENT_KINDS)[number];

export const DECISION_ACTIONS = ["add", "trim", "hold", "exit"] as const;
export type DecisionAction = (typeof DECISION_ACTIONS)[number];

export const OUTCOME_KINDS = ["assumption", "thesis"] as const;
export type OutcomeKind = (typeof OUTCOME_KINDS)[number];

export const OUTCOME_RESULTS = ["true", "false", "ambiguous"] as const;
export type OutcomeResult = (typeof OUTCOME_RESULTS)[number];

export const ALERT_KINDS = ["verdict_change", "kill_criterion"] as const;
export type AlertKind = (typeof ALERT_KINDS)[number];

export const ACTOR_TYPES = ["user", "system"] as const;
export type ActorType = (typeof ACTOR_TYPES)[number];
