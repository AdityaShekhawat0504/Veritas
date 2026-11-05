// Input shapes for actions. Shape checks live here; business rules (such as
// "critical assumptions need a probability") live in rules.ts so they can be
// reported clearly and tested on their own.

import { z } from "zod";
import {
  ASSUMPTION_CATEGORIES,
  DECISION_ACTIONS,
  DIRECTIONS,
  OPERATORS,
  OUTCOME_RESULTS,
  VERDICTS,
} from "@/db/enums";

const finite = () => z.number().finite();
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "expected YYYY-MM-DD");

export const indicatorSpecSchema = z.object({
  catalogKey: z.string().trim().min(1),
  operator: z.enum(OPERATORS),
  threshold: finite(),
  breakThreshold: finite().nullable().optional(),
});
export type IndicatorSpec = z.infer<typeof indicatorSpecSchema>;

export const assumptionInputSchema = z.object({
  text: z.string().trim().min(1),
  falsifiableText: z.string().trim().min(1),
  critical: z.boolean(),
  category: z.enum(ASSUMPTION_CATEGORIES),
  probability: finite().nullable().optional(),
  resolveBy: z.string().nullable().optional(),
  indicators: z.array(indicatorSpecSchema).default([]),
});
export type AssumptionInput = z.infer<typeof assumptionInputSchema>;

export const killCriterionInputSchema = z.object({
  condition: z.string().trim().min(1),
  indicators: z.array(indicatorSpecSchema).default([]),
});

export const createThesisSchema = z.object({
  ticker: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z][A-Z0-9.\-]{0,9}$/, "not a valid ticker"),
  cik: z
    .string()
    .trim()
    .regex(/^\d{1,10}$/, "CIK must be up to 10 digits")
    .transform((v) => v.padStart(10, "0"))
    .nullable()
    .optional(),
  securityName: z.string().trim().min(1).nullable().optional(),
  claim: z.string().trim().min(1),
  direction: z.enum(DIRECTIONS),
  horizonMonths: z.number().int().min(1).max(120),
  convictionPct: z.number().int().min(0).max(100),
  memoText: z.string().nullable().optional(),
  draftExtraction: z.unknown().optional(),
  position: z
    .object({
      sizePct: finite().min(0).max(100),
      entryDate: isoDate.nullable().optional(),
      entryPrice: finite().positive().nullable().optional(),
    })
    .nullable()
    .optional(),
});
export type CreateThesisInput = z.input<typeof createThesisSchema>;

export const confirmExtractionSchema = z.object({
  thesisId: z.string().uuid(),
  claim: z.string().trim().min(1).optional(),
  direction: z.enum(DIRECTIONS).optional(),
  horizonMonths: z.number().int().min(1).max(120).optional(),
  convictionPct: z.number().int().min(0).max(100).optional(),
  assumptions: z.array(assumptionInputSchema).min(1, "at least one assumption is required"),
  killCriteria: z.array(killCriterionInputSchema).default([]),
});
export type ConfirmExtractionInput = z.input<typeof confirmExtractionSchema>;

export const reviseThesisSchema = z.object({
  thesisId: z.string().uuid(),
  reason: z.string().trim().min(3, "a reason is required"),
  claim: z.string().trim().min(1).optional(),
  direction: z.enum(DIRECTIONS).optional(),
  horizonMonths: z.number().int().min(1).max(120).optional(),
  convictionPct: z.number().int().min(0).max(100).optional(),
  assumptionChanges: z
    .array(
      z.object({
        assumptionId: z.string().uuid(),
        text: z.string().trim().min(1).optional(),
        falsifiableText: z.string().trim().min(1).optional(),
        critical: z.boolean().optional(),
        category: z.enum(ASSUMPTION_CATEGORIES).optional(),
        probability: finite().nullable().optional(),
        resolveBy: z.string().nullable().optional(),
      }),
    )
    .default([]),
  addAssumptions: z.array(assumptionInputSchema).default([]),
  retireAssumptionIds: z.array(z.string().uuid()).default([]),
  addKillCriteria: z.array(killCriterionInputSchema).default([]),
});
export type ReviseThesisInput = z.input<typeof reviseThesisSchema>;

export const closeThesisSchema = z.object({
  thesisId: z.string().uuid(),
  reason: z.string().trim().min(3, "a reason is required"),
  thesisReturnPct: finite().nullable().optional(),
  benchmarkReturnPct: finite().nullable().optional(),
});
export type CloseThesisInput = z.input<typeof closeThesisSchema>;

export const bindIndicatorSchema = indicatorSpecSchema.extend({
  assumptionId: z.string().uuid().optional(),
  killCriterionId: z.string().uuid().optional(),
});
export type BindIndicatorInput = z.input<typeof bindIndicatorSchema>;

const triggerSchema = z.enum(["event", "sweep", "manual"]);

export const numericObservationSchema = z.object({
  value: finite().nullable(),
  asOf: z.string().nullable(),
  label: z.string().min(1),
  sourceUrl: z.string().url().nullable(),
  docId: z.string().nullable().optional(),
  publishedAt: z.string().nullable().optional(),
  detail: z.record(z.unknown()).optional(),
});
export type NumericObservation = z.infer<typeof numericObservationSchema>;

export const runCheckSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("numeric"),
    indicatorId: z.string().uuid(),
    trigger: triggerSchema,
    eventId: z.string().uuid().nullable().optional(),
    observation: numericObservationSchema,
  }),
  z.object({
    kind: z.literal("text"),
    assumptionId: z.string().uuid(),
    trigger: triggerSchema,
    eventId: z.string().uuid().nullable().optional(),
    model: z.string().min(1),
    promptVersion: z.string().min(1),
    proposedVerdict: z.enum(VERDICTS),
    quote: z.string().nullable(),
    documentId: z.string().uuid().nullable(),
    rationale: z.string().nullable().optional(),
  }),
]);
export type RunCheckInput = z.input<typeof runCheckSchema>;

export const overrideVerdictSchema = z.object({
  checkId: z.string().uuid(),
  verdict: z.enum(VERDICTS),
  reason: z.string().trim().min(5, "a reason is required"),
  evidence: z
    .array(z.object({ documentId: z.string().uuid(), quote: z.string().min(1) }))
    .default([]),
});
export type OverrideVerdictInput = z.input<typeof overrideVerdictSchema>;

export const recordDecisionSchema = z.object({
  thesisId: z.string().uuid(),
  action: z.enum(DECISION_ACTIONS),
  sizeChangePct: finite().default(0),
  rationale: z.string().trim().min(10, "a rationale of at least 10 characters is required"),
});
export type RecordDecisionInput = z.input<typeof recordDecisionSchema>;

export const resolveAssumptionSchema = z.object({
  assumptionId: z.string().uuid(),
  result: z.enum(OUTCOME_RESULTS),
  note: z.string().trim().nullable().optional(),
});
export type ResolveAssumptionInput = z.input<typeof resolveAssumptionSchema>;

export const triggerKillCriterionSchema = z.object({
  killCriterionId: z.string().uuid(),
  reason: z.string().trim().min(3),
});
export type TriggerKillCriterionInput = z.input<typeof triggerKillCriterionSchema>;
