import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { FetchLike } from "@/lib/data/http";

export function loadFixture(name: string): unknown {
  return JSON.parse(readFileSync(fileURLToPath(new URL(`../fixtures/${name}`, import.meta.url)), "utf8")) as unknown;
}

/** A fetch stand-in that serves fixtures by URL substring and records every call. */
export function fakeFetch(routes: Record<string, unknown>): FetchLike & { calls: { url: string; headers: Record<string, string> }[] } {
  const calls: { url: string; headers: Record<string, string> }[] = [];
  const fn = async (url: string, init?: { headers?: Record<string, string> }) => {
    calls.push({ url, headers: init?.headers ?? {} });
    for (const [pattern, body] of Object.entries(routes)) {
      if (url.includes(pattern)) return new Response(JSON.stringify(body), { status: 200 });
    }
    return new Response(JSON.stringify({ message: "not found" }), { status: 404 });
  };
  return Object.assign(fn, { calls });
}
