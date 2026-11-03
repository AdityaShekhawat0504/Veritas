// Production wiring for the LLM gateway: provider and models from env, and
// every call stored through the recordLlmCall action.

import type { Db } from "@/db/types";
import { recordLlmCall } from "@/lib/actions";
import { LlmError, type Gateway } from "./index";
import { pricesFromEnv } from "./pricing";
import { createMockProvider } from "./providers/mock";
import { createOpenAiProvider } from "./providers/openai";
import type { LlmLogger, LlmProvider } from "./types";

/** Logger that stores each call through the recordLlmCall action. */
export function dbLogger(db: Db): LlmLogger {
  return (record) => recordLlmCall(db, record);
}

/**
 * Gateway from environment variables. LLM_PROVIDER=mock gives a provider that
 * returns an empty extraction, useful for clicking through the UI without a key.
 */
export function gatewayFromEnv(db: Db, env: Record<string, string | undefined> = process.env): Gateway {
  const providerName = env.LLM_PROVIDER ?? "openai";
  let provider: LlmProvider;
  if (providerName === "mock") {
    provider = createMockProvider(() => ({
      claim: "",
      direction: "long",
      horizonMonths: 12,
      convictionPct: null,
      assumptions: [],
      killCriteria: [],
    }));
  } else if (providerName === "openai") {
    const apiKey = env.OPENAI_API_KEY;
    if (!apiKey) throw new LlmError("OPENAI_API_KEY is not set");
    provider = createOpenAiProvider({ apiKey });
  } else {
    throw new LlmError(`Unknown LLM_PROVIDER "${providerName}"`);
  }
  return {
    provider,
    models: {
      default: env.LLM_MODEL_DEFAULT ?? "gpt-5.4-mini",
      extract: env.LLM_MODEL_EXTRACT ?? env.LLM_MODEL_DEFAULT ?? "gpt-5.4",
    },
    prices: pricesFromEnv(env),
    log: dbLogger(db),
  };
}
