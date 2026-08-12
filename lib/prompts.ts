// ALL prompts live here, nowhere else. This file also owns the strict JSON
// schema for the decompose call so the model's output is guaranteed to parse
// into the DecomposedThesis type (lib/types.ts).

/** System prompt for memo -> structured thesis decomposition. */
export const DECOMPOSE_SYSTEM_PROMPT = `You are an investment-committee analyst's assistant. You read a plain-language investment memo and decompose it into a structured, monitorable thesis.

Extract exactly the following, grounded ONLY in what the memo says — never invent facts, numbers, or sources:

1. claim — the single core claim the memo is making, in one tight sentence.
2. direction — the position: "long", "short", or "hold".
3. horizon — the stated time horizon (e.g. "12 months"). If unstated, infer the most reasonable horizon from context.
4. conviction — the author's stated or clearly implied confidence: "low", "medium", or "high".
5. decision — the implied action (e.g. "buy", "sell", "size up", "hold") and the sizing if stated (e.g. "top-five position"); sizing is null if the memo gives none.
6. assumptions — the MINIMUM set of load-bearing assumptions the thesis rests on. Do not pad the list. For each assumption:
   - text: the assumption as a clear, checkable statement.
   - criticality: "critical" if the thesis DIES when this assumption is false (it is structurally load-bearing); "supporting" if it strengthens the case but the thesis survives without it.
   - evidence: the specific facts, data points, or reasoning the memo offers for this assumption. For each piece of evidence give its text and, only if the memo names one, a source (otherwise source is null). Do not fabricate sources.

Be disciplined about criticality: most theses have only a few genuinely critical assumptions. A monitored risk the author flags as the thing most likely to break the thesis is critical. Reserve "supporting" for second-order points.

Return ONLY the structured object matching the provided schema.`;

/** Wraps the raw memo as the user turn. */
export function decomposeUserPrompt(memo: string): string {
  return `Decompose the following investment memo into a structured thesis.\n\n--- MEMO ---\n${memo.trim()}\n--- END MEMO ---`;
}

/**
 * Strict JSON schema for the decompose response. Mirrors DecomposedThesis
 * exactly: every property required, additionalProperties false, nullable
 * fields typed as ["string","null"] (strict mode forbids optional keys).
 */
/** System prompt for re-checking a single assumption against current reality. */
export const CHECK_SYSTEM_PROMPT = `You are an investment-committee analyst's assistant. You are given ONE load-bearing assumption from a thesis, along with the thesis context and the evidence originally cited for it. Assess whether the assumption is still intact as of now.

Return exactly:
1. status — one of:
   - "holding": the assumption still looks true; nothing credible undermines it.
   - "weakening": there is real pressure or slippage against it, but it has not broken.
   - "contradicted": current reality runs against it; the assumption no longer holds.
2. reason — ONE tight sentence explaining the assessment. Be specific and concrete.
3. source — a source ONLY if you can genuinely point to one you are confident exists (e.g. a well-known filing type, an earnings call, a data provider). If you cannot verify against a real current source, set source to null and make the reason explicitly note that this is a judgement from the thesis's own logic, not a verified external check.

Hard rules:
- NEVER fabricate a source, URL, statistic, headline, or event. Inventing a citation is worse than admitting you cannot verify.
- Do not restate the assumption; assess it.
- When you lack current information, prefer "holding" or "weakening" with an honest reason over asserting a "contradicted" you cannot support.

Return ONLY the structured object matching the provided schema.`;

/** Wraps a single assumption + its thesis context as the user turn for a check. */
export function checkUserPrompt(input: {
  claim: string;
  direction: string;
  horizon: string;
  assumption: { text: string; criticality: string };
  evidence: { text: string; source: string | null }[];
}): string {
  const evidenceLines =
    input.evidence.length > 0
      ? input.evidence
          .map((e) => `  - ${e.text}${e.source ? ` (${e.source})` : ""}`)
          .join("\n")
      : "  - (none cited)";

  return `THESIS CLAIM: ${input.claim}
DIRECTION: ${input.direction}   HORIZON: ${input.horizon}

ASSUMPTION TO ASSESS (${input.assumption.criticality}):
${input.assumption.text}

EVIDENCE ORIGINALLY CITED:
${evidenceLines}

Assess this assumption's current status.`;
}

/** Strict JSON schema for the check response. Mirrors CheckResult exactly. */
export const CHECK_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["status", "reason", "source"],
  properties: {
    status: {
      type: "string",
      enum: ["holding", "weakening", "contradicted"],
      description: "Whether the assumption still holds, is under pressure, or has broken.",
    },
    reason: {
      type: "string",
      description: "One tight sentence explaining the assessment.",
    },
    source: {
      type: ["string", "null"],
      description: "A genuine source if confident one exists, otherwise null. Never fabricate.",
    },
  },
} as const;

export const DECOMPOSE_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["claim", "direction", "horizon", "conviction", "decision", "assumptions"],
  properties: {
    claim: {
      type: "string",
      description: "The single core claim, in one tight sentence.",
    },
    direction: {
      type: "string",
      enum: ["long", "short", "hold"],
    },
    horizon: {
      type: "string",
      description: 'The time horizon, e.g. "12 months".',
    },
    conviction: {
      type: "string",
      enum: ["low", "medium", "high"],
    },
    decision: {
      type: "object",
      additionalProperties: false,
      required: ["action", "sizing"],
      properties: {
        action: {
          type: "string",
          description: 'The implied action, e.g. "buy", "sell", "size up", "hold".',
        },
        sizing: {
          type: ["string", "null"],
          description: "Sizing if stated, otherwise null.",
        },
      },
    },
    assumptions: {
      type: "array",
      description: "The minimum set of load-bearing assumptions.",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["text", "criticality", "evidence"],
        properties: {
          text: {
            type: "string",
            description: "The assumption as a clear, checkable statement.",
          },
          criticality: {
            type: "string",
            enum: ["critical", "supporting"],
            description: "critical if the thesis dies when false; otherwise supporting.",
          },
          evidence: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["text", "source"],
              properties: {
                text: {
                  type: "string",
                  description: "The supporting fact or reasoning from the memo.",
                },
                source: {
                  type: ["string", "null"],
                  description: "Source if the memo names one, otherwise null.",
                },
              },
            },
          },
        },
      },
    },
  },
} as const;
