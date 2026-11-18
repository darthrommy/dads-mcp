import { existsSync, mkdtempSync, readdirSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { expect, test } from "vitest";
import { HttpError } from "../src/http.js";
import { CURRENT, pageFile, parsePage, serializePage } from "../src/snapshot/layout.js";
import { runUpdate, UpdateAbortedError, UpdateInProgressError } from "../src/snapshot/update.js";
import { makeFakeHttp } from "./helpers.js";

const tmp = () => mkdtempSync(path.join(os.tmpdir(), "dads-cache-"));
const manifestOf = (dir: string) => JSON.parse(readFileSync(path.join(dir, CURRENT, "manifest.json"), "utf8"));

test("writes a complete snapshot", async () => {
  const cacheDir = tmp();
  const m = await runUpdate({ cacheDir, http: await makeFakeHttp(), now: () => new Date("2026-11-18T00:00:00Z") });
  const disk = manifestOf(cacheDir);
  expect(disk).toEqual(m);
  expect(m.schemaVersion).toBe(1);
  expect(m.fetchedAt).toBe("2026-11-18T00:00:00.000Z");
  expect(m.counts.pages).toBe(5);
  expect(m.tokensVersion).toBe("2.1.0");
  expect(m.repos.html).toMatch(/^abc1234/);
  const page = parsePage(readFileSync(pageFile(path.join(cacheDir, CURRENT), "components/test-button"), "utf8"), "components/test-button");
  expect(page.title).toBe("テストボタン（概要）");
  expect(existsSync(path.join(cacheDir, CURRENT, "repos", "react", "TestButton", "TestButton.tsx"))).toBe(true);
  expect(existsSync(path.join(cacheDir, CURRENT, "tokens", "tokens.css"))).toBe(true);
  expect(existsSync(path.join(cacheDir, CURRENT, "search-index.json"))).toBe(true);
  const comps = JSON.parse(readFileSync(path.join(cacheDir, CURRENT, "components.json"), "utf8"));
  expect(comps[0]).toMatchObject({ slug: "test-button", htmlDir: "test-button", reactDir: "TestButton" });
  expect(existsSync(path.join(cacheDir, "update.lock"))).toBe(false);
});

test("aborts when 20% or more pages fail", async () => {
  const cacheDir = tmp();
  const http = await makeFakeHttp((url) => (url.endsWith("/guidance/test-guide/") ? Promise.reject(new HttpError(404, url)) : undefined));
  await expect(runUpdate({ cacheDir, http })).rejects.toBeInstanceOf(UpdateAbortedError);
  expect(existsSync(path.join(cacheDir, CURRENT))).toBe(false);
  expect(readdirSync(cacheDir).filter((f) => f.startsWith("staging-"))).toEqual([]);
});

test("keeps existing snapshot when network fails", async () => {
  const cacheDir = tmp();
  await runUpdate({ cacheDir, http: await makeFakeHttp(), now: () => new Date("2026-11-01T00:00:00Z") });
  const down = await makeFakeHttp(() => Promise.reject(new TypeError("fetch failed")));
  await expect(runUpdate({ cacheDir, http: down, now: () => new Date("2026-11-18T00:00:00Z") })).rejects.toBeInstanceOf(UpdateAbortedError);
  expect(manifestOf(cacheDir).fetchedAt).toBe("2026-11-01T00:00:00.000Z");
  expect(readdirSync(cacheDir).filter((f) => f.startsWith("staging-"))).toEqual([]);
});

test("rejects a second concurrent update via lock file", async () => {
  const cacheDir = tmp();
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  const base = await makeFakeHttp();
  const gated = { ...base, text: async (u: string) => (u.endsWith("sitemap-index.xml") ? gate.then(() => base.text(u)) : base.text(u)) };
  const first = runUpdate({ cacheDir, http: gated });
  await new Promise((r) => setTimeout(r, 20));
  await expect(runUpdate({ cacheDir, http: await makeFakeHttp() })).rejects.toBeInstanceOf(UpdateInProgressError);
  release();
  await expect(first).resolves.toMatchObject({ schemaVersion: 1 });
  expect(existsSync(path.join(cacheDir, "update.lock"))).toBe(false);
});

test("serializePage/parsePage round trip", () => {
  const doc = {
    path: "components/x",
    url: "https://design.digital.go.jp/dads/components/x/",
    title: 'タイトル "引用" と\n改行',
    updated: "2026-10-21",
    markdown: "# t\n\n---\n\n本文\n---\n",
    resourceLinks: {},
  };
  expect(parsePage(serializePage(doc, "2026-11-18T00:00:00.000Z"), "components/x")).toEqual(doc);
});
