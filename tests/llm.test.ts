import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  callStructured,
  costUsd,
  createMockProvider,
  createOpenAiProvider,
  LlmError,
  pricesFromEnv,
  type Gateway,
  type LlmCallLog,
  type PromptDef,
} from "@/lib/llm";

const echoPrompt: PromptDef<{ q: string }, { answer: string }> = {
  id: "echo",
  version: "echo@1",
  system: "Answer.",
  render: (i) => i.q,
  schemaName: "echo",
  jsonSchema: { type: "object", additionalProperties: false, required: ["answer"], properties: { answer: { type: "string" } } },
  parse: (raw) => z.object({ answer: z.string() }).parse(raw),
};

function gateway(responder: () => unknown, prices = { inputPerMTok: 2, outputPerMTok: 8 }) {
  const logs: LlmCallLog[] = [];
  let t = 1000;
  const provider = createMockProvider(responder, { model: "mock-1", inputTokens: 500_000, outputTokens: 250_000 });
  const gw: Gateway = {
    provider,
    models: { default: "small", extract: "large" },
    prices,
    log: async (r) => {
      logs.push(r);
    },
    clock: () => (t += 10),
  };
  return { gw, logs, provider };
}

describe("LLM gateway (rule 7)", () => {
  it("logs model, prompt version, tokens and cost for every call", async () => {
    const { gw, logs, provider } = gateway(() => ({ answer: "yes" }));
    const res = await callStructured(gw, { prompt: echoPrompt, input: { q: "ok?" }, purpose: "extract", firmId: null });
    expect(res.output).toEqual({ answer: "yes" });
    expect(provider.calls[0].model).toBe("large");
    expect(logs).toHaveLength(1);
    expect(logs[0]).toEqual({
      firmId: null,
      purpose: "extract",
      provider: "mock",
      model: "mock-1",
      promptId: "echo",
      promptVersion: "echo@1",
      inputTokens: 500_000,
      outputTokens: 250_000,
      costUsd: 3,
      latencyMs: 10,
      ok: true,
      error: null,
    });
  });

  it("uses the default model for unknown purposes", async () => {
    const { gw, provider } = gateway(() => ({ answer: "x" }));
    await callStructured(gw, { prompt: echoPrompt, input: { q: "?" }, purpose: "other" });
    expect(provider.calls[0].model).toBe("small");
  });

  it("logs and throws when the output does not match the prompt schema", async () => {
    const { gw, logs } = gateway(() => ({ wrong: 1 }));
    let caught: unknown;
    try {
      await callStructured(gw, { prompt: echoPrompt, input: { q: "?" }, purpose: "extract" });
    } catch (e) {
      caught = e;
    }
    expect(caught instanceof LlmError).toBe(true);
    expect(logs[0].ok).toBe(false);
    expect(logs[0].inputTokens).toBe(500_000);
  });

  it("logs and throws when the provider fails", async () => {
    const { gw, logs } = gateway(() => {
      throw new Error("boom");
    });
    let caught: unknown;
    try {
      await callStructured(gw, { prompt: echoPrompt, input: { q: "?" }, purpose: "extract" });
    } catch (e) {
      caught = e;
    }
    expect(caught instanceof LlmError).toBe(true);
    expect(logs[0].ok).toBe(false);
    expect(logs[0].error).toBe("boom");
  });

  it("stores cost as null when prices are not configured", () => {
    expect(pricesFromEnv({})).toBeNull();
    expect(costUsd(null, 10, 10)).toBeNull();
    expect(pricesFromEnv({ LLM_PRICE_INPUT_PER_MTOK_USD: "1", LLM_PRICE_OUTPUT_PER_MTOK_USD: "4" })).toEqual({
      inputPerMTok: 1,
      outputPerMTok: 4,
    });
  });
});

describe("OpenAI provider (mocked fetch)", () => {
  it("sends a strict json_schema request and reads usage", async () => {
    let sent: { url: string; body: Record<string, unknown>; auth: string } | null = null;
    const fetchImpl = (async (url: string, init: { body: string; headers: Record<string, string> }) => {
      sent = { url, body: JSON.parse(init.body) as Record<string, unknown>, auth: init.headers.Authorization };
      return new Response(
        JSON.stringify({
          model: "gpt-test-2026",
          choices: [{ message: { content: '{"answer":"hi"}' } }],
          usage: { prompt_tokens: 12, completion_tokens: 3 },
        }),
        { status: 200 },
      );
    }) as unknown as typeof fetch;
    const p = createOpenAiProvider({ apiKey: "sk-test", fetchImpl });
    const res = await p.complete({ model: "m", system: "s", user: "u", schemaName: "echo", jsonSchema: { type: "object" } });
    expect(res).toEqual({ text: '{"answer":"hi"}', model: "gpt-test-2026", inputTokens: 12, outputTokens: 3 });
    const s = sent as unknown as { url: string; body: { response_format: { json_schema: { strict: boolean } } }; auth: string };
    expect(s.url).toBe("https://api.openai.com/v1/chat/completions");
    expect(s.body.response_format.json_schema.strict).toBe(true);
    expect(s.auth).toBe("Bearer sk-test");
  });

  it("throws on an error status", async () => {
    const fetchImpl = (async () =>
      new Response(JSON.stringify({ error: { message: "bad key" } }), { status: 401 })) as unknown as typeof fetch;
    const p = createOpenAiProvider({ apiKey: "x", fetchImpl });
    let msg = "";
    try {
      await p.complete({ model: "m", system: "s", user: "u", schemaName: "e", jsonSchema: {} });
    } catch (e) {
      msg = (e as Error).message;
    }
    expect(msg).toMatch(/401.*bad key/);
  });
});
