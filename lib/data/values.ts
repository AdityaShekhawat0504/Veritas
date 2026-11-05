// Turn a catalog item into an observed value from the data sources. All maths
// is here, in code; nothing in this file uses a model (rule 4).

import type { CatalogFrequency, CatalogTransform } from "@/db/enums";
import type { NumericObservation } from "@/lib/actions/schemas";
import { filingIndexUrl, type CompanyConcept, type EdgarClient, type XbrlFact } from "./edgar";
import { fredSeriesUrl, type FredClient, type FredObservation } from "./fred";
import { tiingoPricesUrl, type DailyPrice, type PriceClient } from "./tiingo";

const DAY = 86_400_000;
const days = (a: string, b: string) => (Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY;

export function shiftYears(date: string, years: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCFullYear(d.getUTCFullYear() + years);
  return d.toISOString().slice(0, 10);
}

const round = (n: number) => Math.round(n * 1e4) / 1e4;

// ---------- XBRL ----------

/** Facts of one period type, one per period (the most recently filed wins, so restatements apply). */
export function periodFacts(facts: XbrlFact[], frequency: CatalogFrequency): XbrlFact[] {
  const fits = (f: XbrlFact): boolean => {
    if (frequency === "instant") return !f.start;
    if (!f.start) return false;
    const d = days(f.start, f.end) + 1;
    if (frequency === "quarterly") return d >= 80 && d <= 100;
    if (frequency === "annual") return d >= 350 && d <= 380;
    return false;
  };
  const byPeriod = new Map<string, XbrlFact>();
  for (const f of facts) {
    if (!fits(f) || !Number.isFinite(f.val)) continue;
    const key = `${f.start ?? ""}/${f.end}`;
    const prev = byPeriod.get(key);
    if (!prev || f.filed > prev.filed) byPeriod.set(key, f);
  }
  return [...byPeriod.values()].sort((a, b) => (a.end < b.end ? -1 : a.end > b.end ? 1 : 0));
}

/** The fact for the same kind of period ending about one year before `latest`. */
export function yearEarlier(series: XbrlFact[], latest: XbrlFact): XbrlFact | null {
  const candidates = series.filter((f) => {
    const gap = days(f.end, latest.end);
    return gap >= 350 && gap <= 380;
  });
  return candidates.length > 0 ? candidates[candidates.length - 1] : null;
}

const UNIT_PREFERENCE = ["USD", "USD/shares", "shares", "pure"];

export function conceptFacts(concept: CompanyConcept | null): XbrlFact[] {
  if (!concept) return [];
  for (const u of UNIT_PREFERENCE) if (concept.units[u]) return concept.units[u];
  const first = Object.values(concept.units)[0];
  return first ?? [];
}

/** Of several alternative tags, use the one with the most recent period. */
export function pickSeries(seriesByTag: { tag: string; facts: XbrlFact[] }[]): { tag: string; facts: XbrlFact[] } | null {
  let best: { tag: string; facts: XbrlFact[] } | null = null;
  for (const s of seriesByTag) {
    if (s.facts.length === 0) continue;
    if (!best || s.facts[s.facts.length - 1].end > best.facts[best.facts.length - 1].end) best = s;
  }
  return best;
}

export interface XbrlComputation {
  value: number | null;
  fact: XbrlFact | null;
  detail: Record<string, unknown>;
}

export function computeXbrl(
  transform: CatalogTransform,
  numerator: XbrlFact[],
  denominator: XbrlFact[] = [],
): XbrlComputation {
  const latest = numerator[numerator.length - 1];
  if (!latest) return { value: null, fact: null, detail: { reason: "no facts" } };
  if (transform === "level") return { value: latest.val, fact: latest, detail: { end: latest.end } };
  if (transform === "yoy_pct") {
    const prior = yearEarlier(numerator, latest);
    if (!prior || prior.val === 0) return { value: null, fact: latest, detail: { reason: "no comparable prior period" } };
    return {
      value: round(((latest.val - prior.val) / Math.abs(prior.val)) * 100),
      fact: latest,
      detail: { current: latest.val, currentEnd: latest.end, prior: prior.val, priorEnd: prior.end },
    };
  }
  if (transform === "ratio_pct") {
    const den = denominator.find((d) => d.end === latest.end && (d.start ?? "") === (latest.start ?? ""));
    if (!den || den.val === 0) return { value: null, fact: latest, detail: { reason: "no matching denominator" } };
    return {
      value: round((latest.val / den.val) * 100),
      fact: latest,
      detail: { numerator: latest.val, denominator: den.val, end: latest.end },
    };
  }
  return { value: null, fact: null, detail: { reason: `transform ${transform} does not apply to XBRL` } };
}

// ---------- FRED ----------

export function computeFred(
  transform: CatalogTransform,
  obs: FredObservation[],
): { value: number | null; date: string | null; detail: Record<string, unknown> } {
  const valid = obs.filter((o): o is { date: string; value: number } => o.value !== null).sort((a, b) => (a.date < b.date ? -1 : 1));
  const latest = valid[valid.length - 1];
  if (!latest) return { value: null, date: null, detail: { reason: "no observations" } };
  if (transform === "level") return { value: latest.value, date: latest.date, detail: {} };
  if (transform === "yoy_pct") {
    const target = shiftYears(latest.date, -1);
    // Same date a year earlier, or the closest earlier observation within a week (daily series).
    const prior = [...valid].reverse().find((o) => o.date <= target && days(o.date, target) <= 7);
    if (!prior || prior.value === 0) return { value: null, date: latest.date, detail: { reason: "no observation a year earlier" } };
    return {
      value: round(((latest.value - prior.value) / Math.abs(prior.value)) * 100),
      date: latest.date,
      detail: { current: latest.value, prior: prior.value, priorDate: prior.date },
    };
  }
  return { value: null, date: null, detail: { reason: `transform ${transform} does not apply to FRED` } };
}

// ---------- prices ----------

export function computePrice(
  transform: CatalogTransform,
  prices: DailyPrice[],
  entryDate: string | null,
): { value: number | null; date: string | null; detail: Record<string, unknown> } {
  if (!entryDate) return { value: null, date: null, detail: { reason: "position has no entry date" } };
  const since = prices.filter((p) => p.date >= entryDate);
  const first = since[0];
  const last = since[since.length - 1];
  if (!first || !last) return { value: null, date: null, detail: { reason: "no prices since entry" } };
  if (transform === "return_from_entry_pct") {
    return {
      value: round((last.adjClose / first.adjClose - 1) * 100),
      date: last.date,
      detail: { entryDate: first.date, entryAdjClose: first.adjClose, lastAdjClose: last.adjClose },
    };
  }
  if (transform === "drawdown_from_high_pct") {
    const high = since.reduce((m, p) => (p.adjClose > m.adjClose ? p : m), first);
    return {
      value: round((last.adjClose / high.adjClose - 1) * 100),
      date: last.date,
      detail: { highDate: high.date, highAdjClose: high.adjClose, lastAdjClose: last.adjClose },
    };
  }
  return { value: null, date: null, detail: { reason: `transform ${transform} does not apply to prices` } };
}

// ---------- resolver ----------

export interface CatalogRow {
  key: string;
  label: string;
  source: "xbrl" | "fred" | "price";
  sourceCode: string;
  denominatorCode?: string | null;
  transform: CatalogTransform;
  frequency: CatalogFrequency;
  unit: string;
}

export interface DataSources {
  edgar?: EdgarClient;
  fred?: FredClient;
  prices?: PriceClient;
}

export class SourceUnavailableError extends Error {}

/**
 * Resolves catalog items to observations, caching each source call for the
 * life of the resolver (one job run). Throws SourceUnavailableError when the
 * source is not configured; network errors propagate.
 */
export function createResolver(src: DataSources, opts: { today: string }) {
  const concepts = new Map<string, Promise<CompanyConcept | null>>();
  const series = new Map<string, Promise<FredObservation[]>>();
  const priceCache = new Map<string, Promise<DailyPrice[]>>();

  const concept = (cik: string, tag: string) => {
    const k = `${cik}/${tag}`;
    if (!src.edgar) throw new SourceUnavailableError("EDGAR is not configured (EDGAR_USER_AGENT)");
    const edgar = src.edgar;
    if (!concepts.has(k)) concepts.set(k, edgar.companyConcept(cik, tag));
    return concepts.get(k) as Promise<CompanyConcept | null>;
  };

  async function tagSeries(cik: string, codes: string, frequency: CatalogFrequency) {
    const tags = codes.split("|").map((t) => t.trim()).filter(Boolean);
    const all = await Promise.all(
      tags.map(async (tag) => ({ tag, facts: periodFacts(conceptFacts(await concept(cik, tag)), frequency) })),
    );
    return pickSeries(all);
  }

  return {
    async observe(
      item: CatalogRow,
      ctx: { ticker: string; cik: string | null; entryDate: string | null },
    ): Promise<NumericObservation> {
      const base = { label: item.label };
      if (item.source === "xbrl") {
        if (!ctx.cik) {
          return { ...base, value: null, asOf: null, sourceUrl: null, detail: { reason: "security has no CIK" } };
        }
        const num = await tagSeries(ctx.cik, item.sourceCode, item.frequency);
        const den = item.denominatorCode ? await tagSeries(ctx.cik, item.denominatorCode, item.frequency) : null;
        const r = computeXbrl(item.transform, num?.facts ?? [], den?.facts ?? []);
        const fact = r.value === null ? null : r.fact;
        return {
          ...base,
          value: r.value,
          asOf: fact ? fact.end : null,
          sourceUrl: fact ? filingIndexUrl(ctx.cik, fact.accn) : null,
          docId: fact ? fact.accn : null,
          publishedAt: fact ? fact.filed : null,
          detail: { ...r.detail, tag: num?.tag ?? null, form: fact?.form ?? null },
        };
      }
      if (item.source === "fred") {
        if (!src.fred) throw new SourceUnavailableError("FRED is not configured (FRED_API_KEY)");
        const fredClient = src.fred;
        const start = shiftYears(opts.today, -3);
        const k = `${item.sourceCode}@${start}`;
        if (!series.has(k)) series.set(k, fredClient.observations(item.sourceCode, { start }));
        const r = computeFred(item.transform, await (series.get(k) as Promise<FredObservation[]>));
        return {
          ...base,
          value: r.value,
          asOf: r.date,
          sourceUrl: r.value === null ? null : fredSeriesUrl(item.sourceCode),
          docId: r.date ? `${item.sourceCode}@${r.date}` : null,
          detail: r.detail,
        };
      }
      if (!src.prices) throw new SourceUnavailableError("Prices are not configured (TIINGO_API_KEY)");
      const priceClient = src.prices;
      if (!ctx.entryDate) {
        return { ...base, value: null, asOf: null, sourceUrl: null, detail: { reason: "position has no entry date" } };
      }
      const k = `${ctx.ticker}@${ctx.entryDate}`;
      if (!priceCache.has(k)) priceCache.set(k, priceClient.dailyPrices(ctx.ticker, ctx.entryDate));
      const r = computePrice(item.transform, await (priceCache.get(k) as Promise<DailyPrice[]>), ctx.entryDate);
      return {
        ...base,
        value: r.value,
        asOf: r.date,
        sourceUrl: r.value === null ? null : tiingoPricesUrl(ctx.ticker),
        docId: r.date ? `${ctx.ticker}@${r.date}` : null,
        detail: r.detail,
      };
    },
  };
}

export type Resolver = ReturnType<typeof createResolver>;
