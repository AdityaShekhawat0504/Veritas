// Data sources from environment variables. A source without its variable is
// left out, and checks that need it are skipped with a reason.
import { createEdgarClient } from "./edgar";
import { createFredClient } from "./fred";
import { createTiingoClient } from "./tiingo";
import type { DataSources } from "./values";

export function dataSourcesFromEnv(env: Record<string, string | undefined> = process.env): DataSources {
  const src: DataSources = {};
  if (env.EDGAR_USER_AGENT) src.edgar = createEdgarClient({ userAgent: env.EDGAR_USER_AGENT });
  if (env.FRED_API_KEY) src.fred = createFredClient({ apiKey: env.FRED_API_KEY });
  if (env.TIINGO_API_KEY) {
    const perMinute = Number(env.TIINGO_MAX_REQUESTS_PER_MINUTE);
    src.prices = createTiingoClient({
      apiKey: env.TIINGO_API_KEY,
      maxPerMinute: Number.isFinite(perMinute) && perMinute > 0 ? perMinute : undefined,
    });
  }
  return src;
}
