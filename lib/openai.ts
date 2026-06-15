// OpenAI client — server-side ONLY. The key lives in process.env.OPENAI_API_KEY
// (gitignored, never NEXT_PUBLIC_*). Lazily instantiated so a missing key throws
// inside a request handler we can catch, not at module import time.

import OpenAI from "openai";

let client: OpenAI | null = null;

export function getOpenAI(): OpenAI {
  if (client) return client;

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "OPENAI_API_KEY is not set — add it to .env.local (server-side only).",
    );
  }

  client = new OpenAI({ apiKey });
  return client;
}
