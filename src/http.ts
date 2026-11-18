import { USER_AGENT } from "./version.js";

export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly url: string,
  ) {
    super(`HTTP ${status}: ${url}`);
    this.name = "HttpError";
  }
}

export interface Http {
  text(url: string): Promise<string>;
  buffer(url: string): Promise<Buffer>;
  json<T>(url: string, headers?: Record<string, string>): Promise<T>;
}

export interface HttpOptions {
  fetchImpl?: typeof fetch;
  concurrency?: number;
  retries?: number;
  retryDelayMs?: number;
}

function semaphore(limit: number) {
  let active = 0;
  const queue: (() => void)[] = [];
  return async function run<T>(fn: () => Promise<T>): Promise<T> {
    if (active >= limit) await new Promise<void>((r) => queue.push(r));
    active++;
    try {
      return await fn();
    } finally {
      active--;
      queue.shift()?.();
    }
  };
}

export function createHttp(opts: HttpOptions = {}): Http {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const retries = opts.retries ?? 2;
  const delay = opts.retryDelayMs ?? 500;
  const run = semaphore(opts.concurrency ?? 4);

  async function request(url: string, headers: Record<string, string> = {}): Promise<Response> {
    for (let attempt = 0; ; attempt++) {
      let res: Response | undefined;
      let error: unknown;
      try {
        res = await run(() => fetchImpl(url, { headers: { "User-Agent": USER_AGENT, ...headers } }));
      } catch (e) {
        error = e;
      }
      if (res?.ok) return res;
      if (res && res.status < 500) throw new HttpError(res.status, url);
      if (attempt >= retries) throw res ? new HttpError(res.status, url) : error;
      await new Promise((r) => setTimeout(r, delay * (attempt + 1)));
    }
  }

  return {
    text: async (url) => (await request(url)).text(),
    buffer: async (url) => Buffer.from(await (await request(url)).arrayBuffer()),
    json: async <T>(url: string, headers?: Record<string, string>) => (await (await request(url, headers)).json()) as T,
  };
}
