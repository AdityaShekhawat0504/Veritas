// Tiingo end-of-day prices. Needs an API key; check Tiingo's commercial
// terms before showing prices to users.
// Docs: https://www.tiingo.com/documentation/end-of-day

import { getJson, type FetchLike } from "./http";
import { createRateLimiter, type Limiter } from "./rateLimit";

export const TIINGO_BASE = "https://api.tiingo.com";

export interface DailyPrice {
  date: string; // YYYY-MM-DD
  close: number;
  adjClose: number;
}

interface RawPrice {
  date: string;
  close: number;
  adjClose: number;
}

export function parsePrices(raw: RawPrice[]): DailyPrice[] {
  return raw
    .filter((p) => Number.isFinite(p.close) && Number.isFinite(p.adjClose))
    .map((p) => ({ date: p.date.slice(0, 10), close: p.close, adjClose: p.adjClose }))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

export function tiingoPricesUrl(ticker: string): string {
  return `${TIINGO_BASE}/tiingo/daily/${encodeURIComponent(ticker.toLowerCase())}/prices`;
}

export interface PriceClient {
  dailyPrices(ticker: string, startDate: string): Promise<DailyPrice[]>;
}

export function createTiingoClient(opts: {
  apiKey: string;
  fetchImpl?: FetchLike;
  limiter?: Limiter;
  maxPerMinute?: number;
}): PriceClient {
  if (!opts.apiKey) throw new Error("TIINGO_API_KEY is not set");
  const limiter = opts.limiter ?? createRateLimiter({ max: opts.maxPerMinute ?? 30, intervalMs: 60_000 });
  return {
    async dailyPrices(ticker, startDate) {
      const url = `${tiingoPricesUrl(ticker)}?startDate=${encodeURIComponent(startDate)}`;
      const raw = await getJson<RawPrice[]>(url, {
        headers: { Authorization: `Token ${opts.apiKey}`, "Content-Type": "application/json" },
        fetchImpl: opts.fetchImpl,
        limiter,
      });
      return parsePrices(raw);
    },
  };
}
