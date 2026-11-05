export interface LlmRequest {
  model: string;
  system: string;
  user: string;
  /** JSON schema for structured output (strict). */
  schemaName: string;
  jsonSchema: Record<string, unknown>;
}

export interface LlmResponse {
  /** Raw text returned by the model; expected to be JSON. */
  text: string;
  /** Model name reported by the provider (may differ from the requested alias). */
  model: string;
  inputTokens: number;
  outputTokens: number;
}

export interface LlmProvider {
  name: string;
  complete(req: LlmRequest): Promise<LlmResponse>;
}

/** A versioned prompt. Change `version` whenever the text or schema changes. */
export interface PromptDef<I, O> {
  id: string;
  version: string;
  system: string;
  render(input: I): string;
  schemaName: string;
  jsonSchema: Record<string, unknown>;
  /** Validate the parsed JSON. Throw on anything unexpected. */
  parse(raw: unknown): O;
}

export interface LlmCallLog {
  firmId: string | null;
  purpose: string;
  provider: string;
  model: string;
  promptId: string;
  promptVersion: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number | null;
  latencyMs: number;
  ok: boolean;
  error: string | null;
}

export type LlmLogger = (record: LlmCallLog) => Promise<unknown>;
