// The only way the app calls a language model (wired to env and the database
// in lib/llm/env.ts). Every call, successful or not,
// is logged with provider, model, prompt id and version, tokens, cost and
// latency.

import { costUsd, type Prices } from "./pricing";
import type { LlmLogger, LlmProvider, LlmResponse, PromptDef } from "./types";

export type { LlmProvider, PromptDef, LlmLogger, LlmCallLog } from "./types";
export { createMockProvider } from "./providers/mock";
export { createOpenAiProvider } from "./providers/openai";
export { costUsd, pricesFromEnv } from "./pricing";

export class LlmError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LlmError";
  }
}

export interface Gateway {
  provider: LlmProvider;
  /** Model per purpose, e.g. { extract: "gpt-5.4" }. Falls back to `default`. */
  models: Record<string, string> & { default: string };
  prices: Prices | null;
  log: LlmLogger;
  clock?: () => number;
}

export interface CallResult<O> {
  output: O;
  model: string;
  promptId: string;
  promptVersion: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number | null;
}

export async function callStructured<I, O>(
  gw: Gateway,
  args: { prompt: PromptDef<I, O>; input: I; purpose: string; firmId?: string | null },
): Promise<CallResult<O>> {
  const clock = gw.clock ?? Date.now;
  const model = gw.models[args.purpose] ?? gw.models.default;
  const started = clock();
  const base = {
    firmId: args.firmId ?? null,
    purpose: args.purpose,
    provider: gw.provider.name,
    promptId: args.prompt.id,
    promptVersion: args.prompt.version,
  };

  let response: LlmResponse;
  try {
    response = await gw.provider.complete({
      model,
      system: args.prompt.system,
      user: args.prompt.render(args.input),
      schemaName: args.prompt.schemaName,
      jsonSchema: args.prompt.jsonSchema,
    });
  } catch (err) {
    await gw.log({
      ...base,
      model,
      inputTokens: 0,
      outputTokens: 0,
      costUsd: null,
      latencyMs: clock() - started,
      ok: false,
      error: (err as Error).message,
    });
    throw new LlmError(`LLM call failed: ${(err as Error).message}`);
  }

  const cost = costUsd(gw.prices, response.inputTokens, response.outputTokens);
  const usage = {
    ...base,
    model: response.model,
    inputTokens: response.inputTokens,
    outputTokens: response.outputTokens,
    costUsd: cost,
    latencyMs: clock() - started,
  };

  let output: O;
  try {
    output = args.prompt.parse(JSON.parse(response.text) as unknown);
  } catch (err) {
    await gw.log({ ...usage, ok: false, error: `invalid output: ${(err as Error).message}` });
    throw new LlmError(`The model returned output that does not match ${args.prompt.id}`);
  }
  await gw.log({ ...usage, ok: true, error: null });
  return {
    output,
    model: response.model,
    promptId: args.prompt.id,
    promptVersion: args.prompt.version,
    inputTokens: response.inputTokens,
    outputTokens: response.outputTokens,
    costUsd: cost,
  };
}
