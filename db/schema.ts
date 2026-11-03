// Drizzle table definitions. The SQL in db/migrations is the source of truth for
// constraints (foreign keys, CHECKs, insert-only triggers); this file gives the
// app typed access to the same columns. tests/schema.test.ts checks the two
// stay in sync.

import {
  bigserial,
  boolean,
  date,
  doublePrecision,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
  vector,
} from "drizzle-orm/pg-core";
import {
  ACTOR_TYPES,
  ALERT_KINDS,
  ASSUMPTION_CATEGORIES,
  ASSUMPTION_STATUSES,
  CATALOG_FREQUENCIES,
  CATALOG_SOURCES,
  CATALOG_TRANSFORMS,
  CHECK_KINDS,
  CHECK_TRIGGERS,
  DECISION_ACTIONS,
  DIRECTIONS,
  EVENT_KINDS,
  OPERATORS,
  OUTCOME_KINDS,
  OUTCOME_RESULTS,
  ROLES,
  THESIS_STATUSES,
  VERDICTS,
} from "./enums";

const id = () => uuid("id").primaryKey().defaultRandom();
const createdAt = () =>
  timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

export const firms = pgTable("firms", {
  id: id(),
  name: text("name").notNull(),
  createdAt: createdAt(),
});

export const users = pgTable("users", {
  id: id(),
  email: text("email").notNull(),
  name: text("name"),
  image: text("image"),
  createdAt: createdAt(),
});

export const memberships = pgTable("memberships", {
  id: id(),
  firmId: uuid("firm_id").notNull(),
  userId: uuid("user_id").notNull(),
  role: text("role", { enum: ROLES }).notNull(),
  createdAt: createdAt(),
});

export const securities = pgTable("securities", {
  id: id(),
  ticker: text("ticker").notNull(),
  cik: text("cik"),
  isin: text("isin"),
  name: text("name"),
  createdAt: createdAt(),
});

export const theses = pgTable("theses", {
  id: id(),
  firmId: uuid("firm_id").notNull(),
  securityId: uuid("security_id").notNull(),
  authorId: uuid("author_id").notNull(),
  claim: text("claim").notNull(),
  direction: text("direction", { enum: DIRECTIONS }).notNull(),
  horizonMonths: integer("horizon_months").notNull(),
  convictionPct: integer("conviction_pct").notNull(),
  status: text("status", { enum: THESIS_STATUSES }).notNull(),
  currentVersion: integer("current_version").notNull().default(0),
  memoText: text("memo_text"),
  draftExtraction: jsonb("draft_extraction"),
  createdAt: createdAt(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  closedAt: timestamp("closed_at", { withTimezone: true }),
});

export const thesisVersions = pgTable("thesis_versions", {
  id: id(),
  thesisId: uuid("thesis_id").notNull(),
  version: integer("version").notNull(),
  snapshot: jsonb("snapshot").notNull(),
  reason: text("reason").notNull(),
  createdBy: uuid("created_by"),
  createdAt: createdAt(),
});

export const positions = pgTable("positions", {
  id: id(),
  thesisId: uuid("thesis_id").notNull(),
  sizePct: doublePrecision("size_pct").notNull(),
  entryDate: date("entry_date"),
  entryPrice: doublePrecision("entry_price"),
  createdAt: createdAt(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const assumptions = pgTable("assumptions", {
  id: id(),
  thesisId: uuid("thesis_id").notNull(),
  text: text("text").notNull(),
  falsifiableText: text("falsifiable_text").notNull(),
  critical: boolean("critical").notNull(),
  category: text("category", { enum: ASSUMPTION_CATEGORIES }).notNull(),
  probability: doublePrecision("probability"),
  resolveBy: date("resolve_by"),
  status: text("status", { enum: ASSUMPTION_STATUSES }).notNull().default("active"),
  sortOrder: integer("sort_order").notNull().default(0),
  embedding: vector("embedding", { dimensions: 1536 }),
  createdAt: createdAt(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const indicatorCatalog = pgTable("indicator_catalog", {
  id: id(),
  key: text("key").notNull(),
  label: text("label").notNull(),
  source: text("source", { enum: CATALOG_SOURCES }).notNull(),
  // XBRL: us-gaap tag(s), "|" separated fallbacks. FRED: series id. Price: metric name.
  sourceCode: text("source_code").notNull(),
  // Only for transform "ratio_pct": the denominator tag(s).
  denominatorCode: text("denominator_code"),
  unit: text("unit").notNull(),
  transform: text("transform", { enum: CATALOG_TRANSFORMS }).notNull(),
  frequency: text("frequency", { enum: CATALOG_FREQUENCIES }).notNull(),
  description: text("description").notNull(),
  active: boolean("active").notNull().default(true),
  createdAt: createdAt(),
});

export const killCriteria = pgTable("kill_criteria", {
  id: id(),
  thesisId: uuid("thesis_id").notNull(),
  condition: text("condition").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  triggeredAt: timestamp("triggered_at", { withTimezone: true }),
  triggeredReason: text("triggered_reason"),
  createdAt: createdAt(),
});

export const indicators = pgTable("indicators", {
  id: id(),
  assumptionId: uuid("assumption_id"),
  killCriterionId: uuid("kill_criterion_id"),
  catalogId: uuid("catalog_id").notNull(),
  operator: text("operator", { enum: OPERATORS }).notNull(),
  threshold: doublePrecision("threshold").notNull(),
  breakThreshold: doublePrecision("break_threshold"),
  createdBy: uuid("created_by"),
  createdAt: createdAt(),
});

export const events = pgTable("events", {
  id: id(),
  kind: text("kind", { enum: EVENT_KINDS }).notNull(),
  securityId: uuid("security_id"),
  sourceKey: text("source_key").notNull(),
  payload: jsonb("payload").notNull(),
  occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
  createdAt: createdAt(),
});

export const documents = pgTable("documents", {
  id: id(),
  securityId: uuid("security_id"),
  sourceUrl: text("source_url").notNull(),
  docType: text("doc_type").notNull(),
  accession: text("accession"),
  publishedAt: timestamp("published_at", { withTimezone: true }),
  text: text("text").notNull(),
  sha256: text("sha256").notNull(),
  createdAt: createdAt(),
});

export const checks = pgTable("checks", {
  id: id(),
  seq: bigserial("seq", { mode: "number" }).notNull(),
  assumptionId: uuid("assumption_id").notNull(),
  kind: text("kind", { enum: CHECK_KINDS }).notNull(),
  verdict: text("verdict", { enum: VERDICTS }).notNull(),
  observed: jsonb("observed"),
  indicatorId: uuid("indicator_id"),
  model: text("model"),
  promptVersion: text("prompt_version"),
  trigger: text("trigger", { enum: CHECK_TRIGGERS }).notNull(),
  eventId: uuid("event_id"),
  overridesCheckId: uuid("overrides_check_id"),
  quoteVerified: boolean("quote_verified"),
  note: text("note"),
  createdBy: uuid("created_by"),
  createdAt: createdAt(),
});

export const evidence = pgTable("evidence", {
  id: id(),
  checkId: uuid("check_id"),
  assumptionId: uuid("assumption_id"),
  documentId: uuid("document_id"),
  sourceUrl: text("source_url").notNull(),
  docId: text("doc_id"),
  quote: text("quote").notNull(),
  observedValue: doublePrecision("observed_value"),
  publishedAt: timestamp("published_at", { withTimezone: true }),
  createdAt: createdAt(),
});

export const decisions = pgTable("decisions", {
  id: id(),
  thesisId: uuid("thesis_id").notNull(),
  action: text("action", { enum: DECISION_ACTIONS }).notNull(),
  sizeChangePct: doublePrecision("size_change_pct").notNull(),
  sizeAfterPct: doublePrecision("size_after_pct").notNull(),
  rationale: text("rationale").notNull(),
  decidedBy: uuid("decided_by").notNull(),
  createdAt: createdAt(),
});

export const outcomes = pgTable("outcomes", {
  id: id(),
  thesisId: uuid("thesis_id").notNull(),
  assumptionId: uuid("assumption_id"),
  kind: text("kind", { enum: OUTCOME_KINDS }).notNull(),
  result: text("result", { enum: OUTCOME_RESULTS }),
  forecastProbability: doublePrecision("forecast_probability"),
  thesisReturnPct: doublePrecision("thesis_return_pct"),
  benchmarkReturnPct: doublePrecision("benchmark_return_pct"),
  note: text("note"),
  resolvedBy: uuid("resolved_by").notNull(),
  createdAt: createdAt(),
});

export const alerts = pgTable("alerts", {
  id: id(),
  firmId: uuid("firm_id").notNull(),
  thesisId: uuid("thesis_id").notNull(),
  assumptionId: uuid("assumption_id"),
  checkId: uuid("check_id"),
  killCriterionId: uuid("kill_criterion_id"),
  kind: text("kind", { enum: ALERT_KINDS }).notNull(),
  previousVerdict: text("previous_verdict", { enum: VERDICTS }),
  newVerdict: text("new_verdict", { enum: VERDICTS }),
  createdAt: createdAt(),
  sentAt: timestamp("sent_at", { withTimezone: true }),
});

export const llmCalls = pgTable("llm_calls", {
  id: id(),
  firmId: uuid("firm_id"),
  purpose: text("purpose").notNull(),
  provider: text("provider").notNull(),
  model: text("model").notNull(),
  promptId: text("prompt_id").notNull(),
  promptVersion: text("prompt_version").notNull(),
  inputTokens: integer("input_tokens").notNull(),
  outputTokens: integer("output_tokens").notNull(),
  costUsd: doublePrecision("cost_usd"),
  latencyMs: integer("latency_ms").notNull(),
  ok: boolean("ok").notNull(),
  error: text("error"),
  createdAt: createdAt(),
});

export const actionLog = pgTable("action_log", {
  id: id(),
  seq: bigserial("seq", { mode: "number" }).notNull(),
  firmId: uuid("firm_id"),
  actorType: text("actor_type", { enum: ACTOR_TYPES }).notNull(),
  actorId: uuid("actor_id"),
  actorName: text("actor_name"),
  action: text("action").notNull(),
  objectType: text("object_type").notNull(),
  objectId: uuid("object_id"),
  before: jsonb("before"),
  after: jsonb("after"),
  createdAt: createdAt(),
});
