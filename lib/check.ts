// assumption -> {status, reason, source}. Server-side only (called from
// /api/check). Runs the smaller/faster model per assumption; the route
// parallelizes across a thesis's assumptions. Never fabricates a source.

import { getOpenAI } from "./openai";
import {
  CHECK_SYSTEM_PROMPT,
  checkUserPrompt,
  CHECK_JSON_SCHEMA,
} from "./prompts";
import type { CheckResult, AssumptionStatus } from "./types";

const CHECK_MODEL = "gpt-5.4-mini";

const VALID_STATUS: readonly AssumptionStatus[] = [
  "holding",
  "weakening",
  "contradicted",
];

export interface CheckInput {
  claim: string;
  direction: string;
  horizon: string;
  assumption: { text: string; criticality: string };
  evidence: { text: string; source: string | null }[];
}

/** Assess a single assumption against current reality. Throws on model/API failure. */
export async function checkAssumption(input: CheckInput): Promise<CheckResult> {
  const client = getOpenAI();

  const completion = await client.chat.completions.create({
    model: CHECK_MODEL,
    messages: [
      { role: "system", content: CHECK_SYSTEM_PROMPT },
      { role: "user", content: checkUserPrompt(input) },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "assumption_check",
        strict: true,
        schema: CHECK_JSON_SCHEMA,
      },
    },
  });

  const raw = completion.choices[0]?.message?.content;
  if (!raw) throw new Error("The model returned an empty response.");

  let parsed: CheckResult;
  try {
    parsed = JSON.parse(raw) as CheckResult;
  } catch {
    throw new Error("The model returned malformed JSON.");
  }

  // Strict schema guarantees the shape, but normalize defensively.
  if (!VALID_STATUS.includes(parsed.status)) {
    throw new Error("The model returned an unknown status.");
  }
  return {
    status: parsed.status,
    reason: typeof parsed.reason === "string" ? parsed.reason : "",
    source: parsed.source && parsed.source.trim().length > 0 ? parsed.source : null,
  };
}
