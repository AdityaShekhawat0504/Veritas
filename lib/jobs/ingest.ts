// Ingestion jobs: record new filings, macro releases and prices as events.
// recordEvent is idempotent, so polling again never creates duplicates.

import { and, eq, inArray, isNotNull } from "drizzle-orm";
import { assumptions, indicatorCatalog, indicators, positions, securities, theses } from "@/db/schema";
import type { Db } from "@/db/types";
import { recordEvent, systemActor } from "@/lib/actions";
import { todayUtc } from "@/lib/actions/rules";
import { filingDocumentUrl, recentFilings, type EdgarClient } from "@/lib/data/edgar";
import type { FredClient } from "@/lib/data/fred";
import type { PriceClient } from "@/lib/data/tiingo";
import { shiftYears } from "@/lib/data/values";

export const WATCHED_FORMS = ["10-K", "10-Q", "8-K", "10-K/A", "10-Q/A"];

export interface NewEvent {
  eventId: string;
  securityId: string | null;
  sourceCode?: string;
}

/** Securities with at least one open thesis. */
async function watchedSecurities(db: Db) {
  return db
    .selectDistinct({ id: securities.id, ticker: securities.ticker, cik: securities.cik })
    .from(securities)
    .innerJoin(theses, eq(theses.securityId, securities.id))
    .where(eq(theses.status, "open"));
}

export async function pollEdgar(
  db: Db,
  edgar: EdgarClient,
  opts: { now?: Date; lookbackDays?: number } = {},
): Promise<NewEvent[]> {
  const actor = systemActor("ingest.edgar");
  const now = opts.now ?? new Date();
  const since = new Date(now.getTime() - (opts.lookbackDays ?? 30) * 86_400_000).toISOString().slice(0, 10);
  const created: NewEvent[] = [];
  for (const s of await watchedSecurities(db)) {
    if (!s.cik) continue;
    const sub = await edgar.submissions(s.cik);
    for (const f of recentFilings(sub)) {
      if (!WATCHED_FORMS.includes(f.form) || f.filingDate < since) continue;
      const res = await recordEvent(db, actor, {
        kind: "filing",
        securityId: s.id,
        sourceKey: f.accessionNumber,
        occurredAt: f.filingDate,
        payload: {
          cik: s.cik,
          ticker: s.ticker,
          form: f.form,
          filingDate: f.filingDate,
          reportDate: f.reportDate,
          url: filingDocumentUrl(s.cik, f.accessionNumber, f.primaryDocument),
        },
      });
      if (res.created) created.push({ eventId: res.event.id, securityId: s.id });
    }
  }
  return created;
}

export async function ingestFred(db: Db, fred: FredClient, opts: { now?: Date } = {}): Promise<NewEvent[]> {
  const actor = systemActor("ingest.fred");
  const rows = await db
    .selectDistinct({ series: indicatorCatalog.sourceCode })
    .from(indicators)
    .innerJoin(indicatorCatalog, eq(indicators.catalogId, indicatorCatalog.id))
    .innerJoin(assumptions, eq(indicators.assumptionId, assumptions.id))
    .innerJoin(theses, eq(assumptions.thesisId, theses.id))
    .where(and(eq(indicatorCatalog.source, "fred"), eq(theses.status, "open"), eq(assumptions.status, "active")));
  const start = shiftYears(todayUtc(opts.now), -1);
  const created: NewEvent[] = [];
  for (const { series } of rows) {
    const obs = (await fred.observations(series, { start })).filter((o) => o.value !== null);
    const latest = obs[obs.length - 1];
    if (!latest) continue;
    const res = await recordEvent(db, actor, {
      kind: "macro_release",
      sourceKey: `${series}:${latest.date}`,
      occurredAt: latest.date,
      payload: { series, date: latest.date, value: latest.value },
    });
    if (res.created) created.push({ eventId: res.event.id, securityId: null, sourceCode: series });
  }
  return created;
}

export async function ingestPrices(db: Db, prices: PriceClient, opts: { now?: Date } = {}): Promise<NewEvent[]> {
  const actor = systemActor("ingest.prices");
  const rows = await db
    .selectDistinct({ id: securities.id, ticker: securities.ticker })
    .from(securities)
    .innerJoin(theses, eq(theses.securityId, securities.id))
    .innerJoin(positions, eq(positions.thesisId, theses.id))
    .where(and(eq(theses.status, "open"), isNotNull(positions.entryDate)));
  const start = new Date((opts.now ?? new Date()).getTime() - 10 * 86_400_000).toISOString().slice(0, 10);
  const created: NewEvent[] = [];
  for (const s of rows) {
    const series = await prices.dailyPrices(s.ticker, start);
    const last = series[series.length - 1];
    if (!last) continue;
    const res = await recordEvent(db, actor, {
      kind: "price_move",
      securityId: s.id,
      sourceKey: `${s.ticker}:${last.date}`,
      occurredAt: last.date,
      payload: { ticker: s.ticker, date: last.date, close: last.close, adjClose: last.adjClose },
    });
    if (res.created) created.push({ eventId: res.event.id, securityId: s.id });
  }
  return created;
}

/** Ids of securities by id list, for logging. */
export async function tickersFor(db: Db, ids: string[]): Promise<string[]> {
  if (ids.length === 0) return [];
  const rows = await db.select({ t: securities.ticker }).from(securities).where(inArray(securities.id, ids));
  return rows.map((r) => r.t);
}
