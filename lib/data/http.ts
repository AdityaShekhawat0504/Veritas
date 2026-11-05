import type { Limiter } from "./rateLimit";

export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly url: string,
    message: string,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

export type FetchLike = (url: string, init?: { headers?: Record<string, string> }) => Promise<Response>;

/** GET JSON through a rate limiter. Throws HttpError on a non-2xx status. */
export async function getJson<T>(
  url: string,
  opts: { headers?: Record<string, string>; fetchImpl?: FetchLike; limiter?: Limiter; redactUrl?: string },
): Promise<T> {
  const doFetch: FetchLike = opts.fetchImpl ?? ((u, init) => fetch(u, init));
  const run = () => doFetch(url, { headers: opts.headers });
  const res = opts.limiter ? await opts.limiter.schedule(run) : await run();
  if (!res.ok) {
    const shown = opts.redactUrl ?? url;
    throw new HttpError(res.status, shown, `GET ${shown} failed with ${res.status}`);
  }
  return (await res.json()) as T;
}
