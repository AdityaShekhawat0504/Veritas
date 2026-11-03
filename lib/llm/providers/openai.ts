// OpenAI Chat Completions with strict JSON-schema structured output.
// Docs: https://platform.openai.com/docs/guides/structured-outputs

import type { LlmProvider, LlmRequest, LlmResponse } from "../types";

interface ChatCompletion {
  model?: string;
  choices?: { message?: { content?: string | null; refusal?: string | null } }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number };
  error?: { message?: string };
}

export function createOpenAiProvider(opts: {
  apiKey: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
}): LlmProvider {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const baseUrl = opts.baseUrl ?? "https://api.openai.com/v1";
  return {
    name: "openai",
    async complete(req: LlmRequest): Promise<LlmResponse> {
      const res = await fetchImpl(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${opts.apiKey}` },
        body: JSON.stringify({
          model: req.model,
          messages: [
            { role: "system", content: req.system },
            { role: "user", content: req.user },
          ],
          response_format: {
            type: "json_schema",
            json_schema: { name: req.schemaName, strict: true, schema: req.jsonSchema },
          },
        }),
      });
      const body = (await res.json().catch(() => ({}))) as ChatCompletion;
      if (!res.ok) {
        throw new Error(`OpenAI request failed (${res.status}): ${body.error?.message ?? "no message"}`);
      }
      const message = body.choices?.[0]?.message;
      if (message?.refusal) throw new Error(`Model refused: ${message.refusal}`);
      if (!message?.content) throw new Error("Model returned an empty response");
      return {
        text: message.content,
        model: body.model ?? req.model,
        inputTokens: body.usage?.prompt_tokens ?? 0,
        outputTokens: body.usage?.completion_tokens ?? 0,
      };
    },
  };
}
