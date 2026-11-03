// Cost per call from prices set in the environment, in USD per million tokens.
// Prices change and differ by model, so none are hard-coded: when the prices
// are not set, cost is stored as null rather than guessed.

export interface Prices {
  inputPerMTok: number;
  outputPerMTok: number;
}

export function pricesFromEnv(env: Record<string, string | undefined> = process.env): Prices | null {
  const input = Number(env.LLM_PRICE_INPUT_PER_MTOK_USD);
  const output = Number(env.LLM_PRICE_OUTPUT_PER_MTOK_USD);
  if (!env.LLM_PRICE_INPUT_PER_MTOK_USD || !env.LLM_PRICE_OUTPUT_PER_MTOK_USD) return null;
  if (!Number.isFinite(input) || !Number.isFinite(output) || input < 0 || output < 0) return null;
  return { inputPerMTok: input, outputPerMTok: output };
}

export function costUsd(prices: Prices | null, inputTokens: number, outputTokens: number): number | null {
  if (!prices) return null;
  return (inputTokens * prices.inputPerMTok + outputTokens * prices.outputPerMTok) / 1_000_000;
}
