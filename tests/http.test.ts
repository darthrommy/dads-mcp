import { expect, test } from "vitest";
import { createHttp, HttpError } from "../src/http.js";
import { USER_AGENT } from "../src/version.js";

const ok = (body: string) => new Response(body, { status: 200 });

test("sends User-Agent header", async () => {
  let ua: string | null = null;
  const http = createHttp({
    fetchImpl: async (_u, init) => {
      ua = new Headers(init?.headers).get("user-agent");
      return ok("x");
    },
  });
  await http.text("https://example.com/");
  expect(ua).toBe(USER_AGENT);
});

test("limits concurrency to 4", async () => {
  let active = 0;
  let max = 0;
  const http = createHttp({
    fetchImpl: async () => {
      active++;
      max = Math.max(max, active);
      await new Promise((r) => setTimeout(r, 10));
      active--;
      return ok("x");
    },
  });
  await Promise.all(Array.from({ length: 10 }, (_, i) => http.text(`https://example.com/${i}`)));
  expect(max).toBe(4);
});

test("retries 5xx then succeeds", async () => {
  const statuses = [503, 503, 200];
  let calls = 0;
  const http = createHttp({
    retryDelayMs: 0,
    fetchImpl: async () => {
      const s = statuses[calls++];
      return new Response(s === 200 ? "body" : "err", { status: s });
    },
  });
  expect(await http.text("https://example.com/")).toBe("body");
  expect(calls).toBe(3);
});

test("does not retry 404", async () => {
  let calls = 0;
  const http = createHttp({
    retryDelayMs: 0,
    fetchImpl: async () => {
      calls++;
      return new Response("no", { status: 404 });
    },
  });
  const err = await http.text("https://example.com/").catch((e) => e);
  expect(err).toBeInstanceOf(HttpError);
  expect((err as HttpError).status).toBe(404);
  expect(calls).toBe(1);
});

test("times out a hung request", async () => {
  const http = createHttp({
    retries: 0,
    timeoutMs: 20,
    fetchImpl: (_u, init) =>
      new Promise((_, reject) => init?.signal?.addEventListener("abort", () => reject(init.signal!.reason))),
  });
  await expect(http.text("https://example.com/")).rejects.toThrow();
});
