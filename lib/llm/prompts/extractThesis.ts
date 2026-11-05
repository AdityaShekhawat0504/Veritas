// Memo -> draft thesis. The draft is only a suggestion: the analyst reviews
// every field and sets every probability before anything is saved.

import { z } from "zod";
import { ASSUMPTION_CATEGORIES, DIRECTIONS, OPERATORS } from "@/db/enums";
import { isIsoDate } from "@/lib/actions/rules";
import type { PromptDef } from "../types";

export interface CatalogEntryForPrompt {
  key: string;
  label: string;
  unit: string;
  source: string;
}

export interface ExtractInput {
  memo: string;
  ticker: string;
  today: string;
  catalog: CatalogEntryForPrompt[];
}

const suggestedIndicator = z.object({
  catalogKey: z.string(),
  operator: z.enum(OPERATORS),
  threshold: z.number().finite(),
  breakThreshold: z.number().finite().nullable(),
});

export const extractionSchema = z.object({
  claim: z.string(),
  direction: z.enum(DIRECTIONS),
  horizonMonths: z.number().int().min(1).max(120),
  convictionPct: z.number().int().min(0).max(100).nullable(),
  assumptions: z.array(
    z.object({
      text: z.string(),
      falsifiableText: z.string(),
      critical: z.boolean(),
      category: z.enum(ASSUMPTION_CATEGORIES),
      suggestedResolveBy: z.string().nullable(),
      suggestedIndicators: z.array(suggestedIndicator),
    }),
  ),
  killCriteria: z.array(
    z.object({
      condition: z.string(),
      suggestedIndicator: suggestedIndicator.nullable(),
    }),
  ),
});
export type Extraction = z.infer<typeof extractionSchema>;

const indicatorJson = {
  type: "object",
  additionalProperties: false,
  required: ["catalogKey", "operator", "threshold", "breakThreshold"],
  properties: {
    catalogKey: { type: "string", description: "A key from the indicator catalog. Never invent one." },
    operator: { type: "string", enum: [...OPERATORS] },
    threshold: { type: "number" },
    breakThreshold: {
      type: ["number", "null"],
      description: "Optional second line on the failing side: between threshold and this is 'weakened'.",
    },
  },
} as const;

const jsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["claim", "direction", "horizonMonths", "convictionPct", "assumptions", "killCriteria"],
  properties: {
    claim: { type: "string" },
    direction: { type: "string", enum: [...DIRECTIONS] },
    horizonMonths: { type: "integer" },
    convictionPct: { type: ["integer", "null"] },
    assumptions: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["text", "falsifiableText", "critical", "category", "suggestedResolveBy", "suggestedIndicators"],
        properties: {
          text: { type: "string" },
          falsifiableText: { type: "string" },
          critical: { type: "boolean" },
          category: { type: "string", enum: [...ASSUMPTION_CATEGORIES] },
          suggestedResolveBy: { type: ["string", "null"], description: "YYYY-MM-DD" },
          suggestedIndicators: { type: "array", items: indicatorJson },
        },
      },
    },
    killCriteria: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["condition", "suggestedIndicator"],
        properties: {
          condition: { type: "string" },
          suggestedIndicator: { anyOf: [indicatorJson, { type: "null" }] },
        },
      },
    },
  },
};

const SYSTEM = `You help an investment analyst turn a memo into a trackable thesis.

Return only what the memo supports. Do not invent facts, numbers or sources.

- claim: the core claim in one sentence.
- direction: long or short.
- horizonMonths: the stated horizon in months; if unstated, the most reasonable reading of the memo.
- convictionPct: the stated conviction as 0-100, or null if the memo gives none.
- assumptions: the few load-bearing assumptions. For each:
  - text: the assumption in the memo's terms.
  - falsifiableText: a restatement that a later filing or data release could prove true or false, with a number and a date where possible.
  - critical: true if the thesis fails when this is false.
  - category: one of the allowed categories.
  - suggestedResolveBy: the date (YYYY-MM-DD, after TODAY) by which the assumption can be judged, or null.
  - suggestedIndicators: only indicators from the CATALOG below, by key, with an operator and threshold that match the falsifiable restatement. Use an empty list when no catalog item fits. Never invent a metric.
- killCriteria: conditions under which the author says they would exit, each with one catalog indicator or null.

Do not suggest probabilities. The analyst sets them.`;

export const extractThesisPrompt: PromptDef<ExtractInput, Extraction> = {
  id: "extract-thesis",
  version: "extract-thesis@1",
  system: SYSTEM,
  schemaName: "thesis_extraction",
  jsonSchema,
  render(input) {
    const catalog = input.catalog.map((c) => `- ${c.key}: ${c.label} (${c.unit}, ${c.source})`).join("\n");
    return `TODAY: ${input.today}\nTICKER: ${input.ticker}\n\nCATALOG:\n${catalog || "(empty)"}\n\n--- MEMO ---\n${input.memo.trim()}\n--- END MEMO ---`;
  },
  parse(raw) {
    return extractionSchema.parse(raw);
  },
};

/**
 * Rule 6: keep only indicator suggestions that name a catalog key, and drop
 * resolution dates that are not real future dates. Returns what was dropped.
 */
export function filterToCatalog(
  draft: Extraction,
  catalogKeys: Set<string>,
  today: string,
): { draft: Extraction; dropped: string[] } {
  const dropped: string[] = [];
  const assumptions = draft.assumptions.map((a, i) => {
    const kept = a.suggestedIndicators.filter((ind) => {
      if (catalogKeys.has(ind.catalogKey)) return true;
      dropped.push(`assumptions[${i}]: indicator "${ind.catalogKey}" is not in the catalog`);
      return false;
    });
    let resolveBy = a.suggestedResolveBy;
    if (resolveBy !== null && (!isIsoDate(resolveBy) || resolveBy <= today)) {
      dropped.push(`assumptions[${i}]: resolve date "${resolveBy}" is not a future date`);
      resolveBy = null;
    }
    return { ...a, suggestedIndicators: kept, suggestedResolveBy: resolveBy };
  });
  const killCriteria = draft.killCriteria.map((k, i) => {
    if (k.suggestedIndicator && !catalogKeys.has(k.suggestedIndicator.catalogKey)) {
      dropped.push(`killCriteria[${i}]: indicator "${k.suggestedIndicator.catalogKey}" is not in the catalog`);
      return { ...k, suggestedIndicator: null };
    }
    return k;
  });
  return { draft: { ...draft, assumptions, killCriteria }, dropped };
}
