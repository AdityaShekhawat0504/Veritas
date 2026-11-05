// Deterministic provider for tests and keyless local runs. It returns whatever
// the responder gives it; it never calls a network.

import type { LlmProvider, LlmRequest, LlmResponse } from "../types";

export type MockResponder = (req: LlmRequest) => unknown | Promise<unknown>;

export function createMockProvider(
  responder: MockResponder,
  opts: { model?: string; inputTokens?: number; outputTokens?: number } = {},
): LlmProvider & { calls: LlmRequest[] } {
  const calls: LlmRequest[] = [];
  return {
    name: "mock",
    calls,
    async complete(req: LlmRequest): Promise<LlmResponse> {
      calls.push(req);
      const out = await responder(req);
      return {
        text: typeof out === "string" ? out : JSON.stringify(out),
        model: opts.model ?? `mock:${req.model}`,
        inputTokens: opts.inputTokens ?? Math.ceil((req.system.length + req.user.length) / 4),
        outputTokens: opts.outputTokens ?? 100,
      };
    },
  };
}
