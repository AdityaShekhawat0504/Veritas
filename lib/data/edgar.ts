// SEC EDGAR JSON APIs (no key needed).
// Docs: https://www.sec.gov/search-filings/edgar-application-programming-interfaces
// SEC asks for a User-Agent with a name and contact email, and limits clients
// to 10 requests per second; this adapter stays at 8.

import { getJson, HttpError, type FetchLike } from "./http";
import { createRateLimiter, EDGAR_MAX_PER_SECOND, type Limiter } from "./rateLimit";

export const EDGAR_BASE = "https://data.sec.gov";

export function padCik(cik: string | number): string {
  const digits = String(cik).replace(/\D/g, "");
  if (digits.length === 0 || digits.length > 10) throw new Error(`Invalid CIK: ${cik}`);
  return digits.padStart(10, "0");
}

/** The User-Agent must name the app and give a contact email. */
export function validateUserAgent(ua: string | undefined): string {
  if (!ua || !/\S+@\S+\.\S+/.test(ua) || ua.trim().split(/\s+/).length < 2) {
    throw new Error('EDGAR_USER_AGENT must look like "AppName contact@example.com"');
  }
  return ua.trim();
}

export interface XbrlFact {
  start?: string;
  end: string;
  val: number;
  accn: string;
  fy?: number | null;
  fp?: string | null;
  form: string;
  filed: string;
  frame?: string;
}

export interface CompanyConcept {
  cik: number;
  taxonomy: string;
  tag: string;
  label?: string | null;
  entityName?: string;
  units: Record<string, XbrlFact[]>;
}

export interface CompanyFacts {
  cik: number;
  entityName: string;
  facts: Record<string, Record<string, { label?: string | null; units: Record<string, XbrlFact[]> }>>;
}

export interface Submissions {
  cik: string;
  name: string;
  tickers?: string[];
  filings: {
    recent: {
      accessionNumber: string[];
      filingDate: string[];
      reportDate: string[];
      form: string[];
      primaryDocument: string[];
    };
  };
}

export interface Filing {
  accessionNumber: string;
  filingDate: string;
  reportDate: string;
  form: string;
  primaryDocument: string;
}

/** Turn the column arrays in submissions.filings.recent into rows. */
export function recentFilings(sub: Submissions): Filing[] {
  const r = sub.filings.recent;
  return r.accessionNumber.map((accessionNumber, i) => ({
    accessionNumber,
    filingDate: r.filingDate[i] ?? "",
    reportDate: r.reportDate[i] ?? "",
    form: r.form[i] ?? "",
    primaryDocument: r.primaryDocument[i] ?? "",
  }));
}

/** Human-readable filing index page for an accession number. */
export function filingIndexUrl(cik: string | number, accession: string): string {
  const cikInt = String(Number(padCik(cik)));
  const plain = accession.replace(/-/g, "");
  return `https://www.sec.gov/Archives/edgar/data/${cikInt}/${plain}/${accession}-index.htm`;
}

export function filingDocumentUrl(cik: string | number, accession: string, primaryDocument: string): string {
  const cikInt = String(Number(padCik(cik)));
  return `https://www.sec.gov/Archives/edgar/data/${cikInt}/${accession.replace(/-/g, "")}/${primaryDocument}`;
}

export interface EdgarClient {
  submissions(cik: string): Promise<Submissions>;
  companyFacts(cik: string): Promise<CompanyFacts>;
  /** Null when the company does not report this tag (EDGAR returns 404). */
  companyConcept(cik: string, tag: string, taxonomy?: string): Promise<CompanyConcept | null>;
}

// One limiter per process, shared by every client.
const sharedLimiter = createRateLimiter({ max: EDGAR_MAX_PER_SECOND, intervalMs: 1000 });

export function createEdgarClient(opts: { userAgent: string; fetchImpl?: FetchLike; limiter?: Limiter }): EdgarClient {
  const headers = { "User-Agent": validateUserAgent(opts.userAgent), Accept: "application/json" };
  const limiter = opts.limiter ?? sharedLimiter;
  const get = <T>(path: string) => getJson<T>(`${EDGAR_BASE}${path}`, { headers, fetchImpl: opts.fetchImpl, limiter });
  return {
    submissions: (cik) => get<Submissions>(`/submissions/CIK${padCik(cik)}.json`),
    companyFacts: (cik) => get<CompanyFacts>(`/api/xbrl/companyfacts/CIK${padCik(cik)}.json`),
    async companyConcept(cik, tag, taxonomy = "us-gaap") {
      try {
        return await get<CompanyConcept>(`/api/xbrl/companyconcept/CIK${padCik(cik)}/${taxonomy}/${tag}.json`);
      } catch (err) {
        if (err instanceof HttpError && err.status === 404) return null;
        throw err;
      }
    },
  };
}
