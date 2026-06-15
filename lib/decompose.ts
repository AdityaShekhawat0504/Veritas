// memo -> structured thesis. Server-side only (called from /api/decompose).
// Uses OpenAI structured outputs (response_format json_schema, strict) so the
// returned JSON is guaranteed to match DecomposedThesis.

import { getOpenAI } from "./openai";
import {
  DECOMPOSE_SYSTEM_PROMPT,
  decomposeUserPrompt,
  DECOMPOSE_JSON_SCHEMA,
} from "./prompts";
import type { DecomposedThesis } from "./types";

const DECOMPOSE_MODEL = "gpt-5.4";

export async function decomposeMemo(memo: string): Promise<DecomposedThesis> {
  const client = getOpenAI();

  const completion = await client.chat.completions.create({
    model: DECOMPOSE_MODEL,
    messages: [
      { role: "system", content: DECOMPOSE_SYSTEM_PROMPT },
      { role: "user", content: decomposeUserPrompt(memo) },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "decomposed_thesis",
        strict: true,
        schema: DECOMPOSE_JSON_SCHEMA,
      },
    },
  });

  const raw = completion.choices[0]?.message?.content;
  if (!raw) {
    throw new Error("The model returned an empty response.");
  }

  let parsed: DecomposedThesis;
  try {
    parsed = JSON.parse(raw) as DecomposedThesis;
  } catch {
    throw new Error("The model returned malformed JSON.");
  }

  // Strict schema guarantees the shape, but guard the one field the rest of the
  // app maps over so a surprising response can't crash the caller.
  if (!Array.isArray(parsed.assumptions)) {
    throw new Error("The decomposition was missing its assumptions.");
  }

  return parsed;
}
