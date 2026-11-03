// FRED (St. Louis Fed) observations API. Needs a free API key.
// Docs: https://fred.stlouisfed.org/docs/api/fred/series_observations.html

import { getJson, type FetchLike } from "./http";
import { createRateLimiter, FRED_MAX_PER_MINUTE, type Limiter } from "./rateLimit";

export const FRED_BASE = "https://api.stlouisfed.org/fred";

export interface FredObservation {
  date: string;
  value: number | null;
}

interface RawObservations {
  observations: { date: string; value: string }[];
}

/** FRED writes missing values as "."; those become null. */
export function parseObservations(raw: RawObservations): FredObservation[] {
  return raw.observations.map((o) => {
    const n = Number(o.value);
    return { date: o.date, value: o.value === "." || o.value.trim() === "" || !Number.isFinite(n) ? null : n };
  });
}

export function fredSeriesUrl(seriesId: string): string {
  return `https://fred.stlouisfed.org/series/${encodeURIComponent(seriesId)}`;
}

export interface FredClient {
  observations(seriesId: string, opts?: { start?: string }): Promise<FredObservation[]>;
}

const sharedLimiter = createRateLimiter({ max: FRED_MAX_PER_MINUTE, intervalMs: 60_000 });

export function createFredClient(opts: { apiKey: string; fetchImpl?: FetchLike; limiter?: Limiter }): FredClient {
  if (!opts.apiKey) throw new Error("FRED_API_KEY is not set");
  const limiter = opts.limiter ?? sharedLimiter;
  return {
    async observations(seriesId, o = {}) {
      const params = new URLSearchParams({ series_id: seriesId, api_key: opts.apiKey, file_type: "json" });
      if (o.start) params.set("observation_start", o.start);
      const url = `${FRED_BASE}/series/observations?${params.toString()}`;
      const raw = await getJson<RawObservations>(url, {
        fetchImpl: opts.fetchImpl,
        limiter,
        redactUrl: url.replace(opts.apiKey, "REDACTED"),
      });
      return parseObservations(raw);
    },
  };
}
