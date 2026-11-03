import { describe, expect, it } from "vitest";
import {
  createEdgarClient,
  filingIndexUrl,
  padCik,
  recentFilings,
  validateUserAgent,
  type CompanyConcept,
  type Submissions,
} from "@/lib/data/edgar";
import { createFredClient, parseObservations } from "@/lib/data/fred";
import { createRateLimiter, EDGAR_MAX_PER_SECOND, FRED_MAX_PER_MINUTE } from "@/lib/data/rateLimit";
import { createTiingoClient, parsePrices } from "@/lib/data/tiingo";
import {
  computeFred,
  computePrice,
  computeXbrl,
  conceptFacts,
  createResolver,
  periodFacts,
  pickSeries,
  shiftYears,
  SourceUnavailableError,
} from "@/lib/data/values";
import { INDICATOR_CATALOG } from "@/lib/data/catalog";
import { fakeFetch, loadFixture } from "./helpers/fakeFetch";

const UA = "Veritas-test test@example.com";
const noLimit = createRateLimiter({ max: 1000, intervalMs: 1 });

function fakeClock() {
  let t = 0;
  return {
    now: () => t,
    sleep: async (ms: number) => {
      t += ms;
    },
    advance: (ms: number) => {
      t += ms;
    },
  };
}

describe("rate limiter (rule 9)", () => {
  it("lets at most 8 EDGAR requests start in any second", async () => {
    const clock = fakeClock();
    const limiter = createRateLimiter({ max: EDGAR_MAX_PER_SECOND, intervalMs: 1000, now: clock.now, sleep: clock.sleep });
    const starts: number[] = [];
    await Promise.all(Array.from({ length: 20 }, () => limiter.schedule(async () => void starts.push(clock.now()))));
    expect(starts).toHaveLength(20);
    for (let i = 0; i < starts.length; i++) {
      const inWindow = starts.filter((s) => s > starts[i] - 1000 && s <= starts[i]).length;
      expect(inWindow <= EDGAR_MAX_PER_SECOND).toBe(true);
    }
    expect(starts[8]).toBeGreaterThan(999);
  });

  it("lets at most 100 FRED requests start per minute", async () => {
    const clock = fakeClock();
    const limiter = createRateLimiter({ max: FRED_MAX_PER_MINUTE, intervalMs: 60_000, now: clock.now, sleep: clock.sleep });
    const starts: number[] = [];
    await Promise.all(Array.from({ length: 150 }, () => limiter.schedule(async () => void starts.push(clock.now()))));
    expect(starts.filter((s) => s < 60_000)).toHaveLength(100);
    expect(starts[100]).toBe(60_000);
  });

  it("keeps going after a failed task", async () => {
    const limiter = createRateLimiter({ max: 1, intervalMs: 1 });
    let failed = false;
    await limiter.schedule(async () => {
      throw new Error("x");
    }).catch(() => {
      failed = true;
    });
    expect(failed).toBe(true);
    expect(await limiter.schedule(async () => 42)).toBe(42);
  });
});

describe("EDGAR adapter", () => {
  it("requires a User-Agent with an app name and an email", () => {
    expect(() => validateUserAgent(undefined)).toThrow();
    expect(() => validateUserAgent("veritas")).toThrow();
    expect(() => validateUserAgent("me@example.com")).toThrow();
    expect(validateUserAgent(UA)).toBe(UA);
  });

  it("pads CIKs and builds filing URLs", () => {
    expect(padCik("320193")).toBe("0000320193");
    expect(filingIndexUrl("0000000001", "0000000001-25-000012")).toBe(
      "https://www.sec.gov/Archives/edgar/data/1/000000000125000012/0000000001-25-000012-index.htm",
    );
  });

  it("calls the documented endpoints with the User-Agent and parses filings", async () => {
    const f = fakeFetch({ "/submissions/CIK0000000001.json": loadFixture("edgar-submissions.json") });
    const edgar = createEdgarClient({ userAgent: UA, fetchImpl: f, limiter: noLimit });
    const sub = await edgar.submissions("1");
    expect(f.calls[0].url).toBe("https://data.sec.gov/submissions/CIK0000000001.json");
    expect(f.calls[0].headers["User-Agent"]).toBe(UA);
    const filings = recentFilings(sub);
    expect(filings[0]).toEqual({
      accessionNumber: "0000000001-25-000012",
      filingDate: "2025-08-01",
      reportDate: "2025-06-30",
      form: "10-Q",
      primaryDocument: "exmp-20250630.htm",
    });
  });

  it("returns null when a company does not report a tag", async () => {
    const edgar = createEdgarClient({ userAgent: UA, fetchImpl: fakeFetch({}), limiter: noLimit });
    expect(await edgar.companyConcept("1", "GrossProfit")).toBeNull();
  });

  it("goes through the limiter", async () => {
    let scheduled = 0;
    const limiter = {
      schedule<T>(fn: () => Promise<T>) {
        scheduled++;
        return fn();
      },
    };
    const f = fakeFetch({ "/submissions/": loadFixture("edgar-submissions.json") });
    const edgar = createEdgarClient({ userAgent: UA, fetchImpl: f, limiter });
    await edgar.submissions("1");
    await edgar.companyConcept("1", "X");
    expect(scheduled).toBe(2);
  });
});

describe("FRED adapter", () => {
  it("sends key and file_type, and maps '.' to null", async () => {
    const f = fakeFetch({ "series_id=CPIAUCSL": loadFixture("fred-observations.json") });
    const fred = createFredClient({ apiKey: "k123", fetchImpl: f, limiter: noLimit });
    const obs = await fred.observations("CPIAUCSL", { start: "2024-01-01" });
    const url = new URL(f.calls[0].url);
    expect(url.origin + url.pathname).toBe("https://api.stlouisfed.org/fred/series/observations");
    expect(url.searchParams.get("api_key")).toBe("k123");
    expect(url.searchParams.get("file_type")).toBe("json");
    expect(url.searchParams.get("observation_start")).toBe("2024-01-01");
    expect(obs.find((o) => o.date === "2025-06-01")?.value).toBeNull();
    expect(parseObservations({ observations: [{ date: "2025-01-01", value: "4.33" }] })[0].value).toBe(4.33);
  });

  it("does not leak the API key in error messages", async () => {
    const fred = createFredClient({ apiKey: "secret-key", fetchImpl: fakeFetch({}), limiter: noLimit });
    let msg = "";
    try {
      await fred.observations("NOPE");
    } catch (e) {
      msg = (e as Error).message;
    }
    expect(msg).toMatch(/404/);
    expect(msg.includes("secret-key")).toBe(false);
  });
});

describe("Tiingo adapter", () => {
  it("authenticates with a token header and sorts prices by date", async () => {
    const f = fakeFetch({ "/tiingo/daily/exmp/prices": loadFixture("tiingo-prices.json") });
    const t = createTiingoClient({ apiKey: "tk", fetchImpl: f, limiter: noLimit });
    const prices = await t.dailyPrices("EXMP", "2025-06-01");
    expect(f.calls[0].headers.Authorization).toBe("Token tk");
    expect(f.calls[0].url).toBe("https://api.tiingo.com/tiingo/daily/exmp/prices?startDate=2025-06-01");
    expect(prices.map((p) => p.date)).toEqual(["2025-06-02", "2025-06-03", "2025-06-04", "2025-06-05"]);
    expect(parsePrices([{ date: "2025-01-02T00:00:00.000Z", close: Number.NaN, adjClose: 1 }])).toEqual([]);
  });
});

describe("value maths (rule 4: in code)", () => {
  const revenue = loadFixture("edgar-concept-revenue.json") as CompanyConcept;
  const gross = loadFixture("edgar-concept-grossprofit.json") as CompanyConcept;
  const old = loadFixture("edgar-concept-revenues-old.json") as CompanyConcept;

  it("keeps three-month periods only and applies the latest filing for a period", () => {
    const q = periodFacts(conceptFacts(revenue), "quarterly");
    expect(q.map((f) => f.end)).toEqual(["2024-06-30", "2025-03-31", "2025-06-30"]);
    expect(q[0].accn).toBe("0000000001-25-000012");
  });

  it("computes y/y growth, levels and margins", () => {
    const q = periodFacts(conceptFacts(revenue), "quarterly");
    expect(computeXbrl("yoy_pct", q).value).toBe(15);
    expect(computeXbrl("level", q).value).toBe(1150);
    const fy = periodFacts(conceptFacts(revenue), "annual");
    expect(computeXbrl("yoy_pct", fy).value).toBe(14.2857);
    const gq = periodFacts(conceptFacts(gross), "quarterly");
    expect(computeXbrl("ratio_pct", gq, q).value).toBe(34);
  });

  it("returns null instead of guessing when data is missing", () => {
    const q = periodFacts(conceptFacts(revenue), "quarterly").slice(1);
    expect(computeXbrl("yoy_pct", q).value).toBeNull();
    expect(computeXbrl("level", []).value).toBeNull();
  });

  it("prefers the tag with the most recent data", () => {
    const pick = pickSeries([
      { tag: "Revenues", facts: periodFacts(conceptFacts(old), "quarterly") },
      { tag: "RevenueFromContractWithCustomerExcludingAssessedTax", facts: periodFacts(conceptFacts(revenue), "quarterly") },
    ]);
    expect(pick?.tag).toBe("RevenueFromContractWithCustomerExcludingAssessedTax");
  });

  it("FRED levels and y/y", () => {
    const obs = parseObservations(loadFixture("fred-observations.json") as { observations: { date: string; value: string }[] });
    expect(computeFred("level", obs).value).toBe(320.11);
    expect(computeFred("yoy_pct", obs).value).toBe(2.9293);
    expect(shiftYears("2025-08-01", -1)).toBe("2024-08-01");
  });

  it("price return and drawdown since entry", () => {
    const prices = parsePrices(loadFixture("tiingo-prices.json") as { date: string; close: number; adjClose: number }[]);
    expect(computePrice("return_from_entry_pct", prices, "2025-06-02").value).toBe(-10);
    expect(computePrice("drawdown_from_high_pct", prices, "2025-06-02").value).toBe(-25);
    expect(computePrice("return_from_entry_pct", prices, null).value).toBeNull();
  });

  it("the resolver reports a missing source instead of inventing data", async () => {
    const r = createResolver({}, { today: "2025-09-01" });
    const item = INDICATOR_CATALOG.find((c) => c.key === "cpi_yoy_pct");
    if (!item) throw new Error("catalog item missing");
    let caught: unknown;
    try {
      await r.observe(item, { ticker: "EXMP", cik: null, entryDate: null });
    } catch (e) {
      caught = e;
    }
    expect(caught instanceof SourceUnavailableError).toBe(true);
  });

  it("the resolver builds a cited observation from EDGAR", async () => {
    const f = fakeFetch({
      "/RevenueFromContractWithCustomerExcludingAssessedTax.json": revenue,
      "/Revenues.json": old,
    });
    const edgar = createEdgarClient({ userAgent: UA, fetchImpl: f, limiter: noLimit });
    const r = createResolver({ edgar }, { today: "2025-09-01" });
    const item = INDICATOR_CATALOG.find((c) => c.key === "revenue_yoy_pct_q");
    if (!item) throw new Error("catalog item missing");
    const o = await r.observe(item, { ticker: "EXMP", cik: "0000000001", entryDate: null });
    expect(o.value).toBe(15);
    expect(o.asOf).toBe("2025-06-30");
    expect(o.docId).toBe("0000000001-25-000012");
    expect(o.sourceUrl).toBe(filingIndexUrl("1", "0000000001-25-000012"));
    // Cached: a second observe makes no new requests.
    const before = f.calls.length;
    await r.observe(item, { ticker: "EXMP", cik: "0000000001", entryDate: null });
    expect(f.calls.length).toBe(before);
  });

  it("sub type check", () => {
    const sub = loadFixture("edgar-submissions.json") as Submissions;
    expect(recentFilings(sub)).toHaveLength(4);
  });
});

describe("indicator catalog (rule 6)", () => {
  it("has about 30 unique items with valid definitions", () => {
    const keys = INDICATOR_CATALOG.map((c) => c.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys.length >= 30).toBe(true);
    for (const c of INDICATOR_CATALOG) {
      expect(c.transform === "ratio_pct", c.key).toBe(c.denominatorCode !== null && c.denominatorCode !== undefined);
      if (c.source === "price") expect(["return_from_entry_pct", "drawdown_from_high_pct"]).toContain(c.transform);
      if (c.source !== "price") expect(["return_from_entry_pct", "drawdown_from_high_pct"].includes(c.transform), c.key).toBe(false);
    }
  });
});
