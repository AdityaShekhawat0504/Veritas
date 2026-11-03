// Sliding-window rate limiter: at most `max` starts per `intervalMs`.
// Limits are per process. On serverless, also cap function concurrency (see
// lib/inngest/functions.ts) so parallel instances stay under the source limits.

export interface Limiter {
  schedule<T>(fn: () => Promise<T>): Promise<T>;
}

export interface LimiterOptions {
  max: number;
  intervalMs: number;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}

export function createRateLimiter(opts: LimiterOptions): Limiter {
  const now = opts.now ?? Date.now;
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const starts: number[] = [];
  let queue: Promise<void> = Promise.resolve();

  async function acquire(): Promise<void> {
    for (;;) {
      const t = now();
      while (starts.length > 0 && t - starts[0] >= opts.intervalMs) starts.shift();
      if (starts.length < opts.max) {
        starts.push(t);
        return;
      }
      await sleep(opts.intervalMs - (t - starts[0]));
    }
  }

  return {
    schedule<T>(fn: () => Promise<T>): Promise<T> {
      const slot = queue.then(acquire);
      queue = slot.catch(() => undefined);
      return slot.then(fn);
    },
  };
}

/** SEC EDGAR: the project rule is at most 8 requests per second. */
export const EDGAR_MAX_PER_SECOND = 8;
/** FRED: at most 100 requests per minute. */
export const FRED_MAX_PER_MINUTE = 100;
