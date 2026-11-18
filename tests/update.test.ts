import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { expect, test } from "vitest";
import { HttpError } from "../src/http.js";
import { CURRENT, pageFile, parsePage, serializePage } from "../src/snapshot/layout.js";
import { runUpdate, swapIn, UpdateAbortedError, UpdateInProgressError } from "../src/snapshot/update.js";
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

test("site redesign without main aborts and keeps snapshot", async () => {
  const cacheDir = tmp();
  await runUpdate({ cacheDir, http: await makeFakeHttp(), now: () => new Date("2026-11-01T00:00:00Z") });
  const redesigned = await makeFakeHttp((url) =>
    /\/dads\/(components|foundations|guidance)\//.test(url) ? Promise.resolve("<html><head><title>X</title></head><body><div id=app></div></body></html>") : undefined,
  );
  await expect(runUpdate({ cacheDir, http: redesigned })).rejects.toBeInstanceOf(UpdateAbortedError);
  expect(manifestOf(cacheDir).fetchedAt).toBe("2026-11-01T00:00:00.000Z");
});

test("removes lock left by a dead process", async () => {
  const cacheDir = tmp();
  const deadPid = spawnSync(process.execPath, ["-e", ""]).pid;
  writeFileSync(path.join(cacheDir, "update.lock"), String(deadPid));
  await expect(runUpdate({ cacheDir, http: await makeFakeHttp() })).resolves.toMatchObject({ schemaVersion: 1 });
  expect(existsSync(path.join(cacheDir, "update.lock"))).toBe(false);
});

test("swapIn restores current when the second rename fails", async () => {
  const cacheDir = tmp();
  mkdirSync(path.join(cacheDir, CURRENT));
  writeFileSync(path.join(cacheDir, CURRENT, "marker"), "old");
  const staging = path.join(cacheDir, "staging-x");
  mkdirSync(staging);
  const { rename, rm } = await import("node:fs/promises");
  let calls = 0;
  const failing = async (a: string, b: string) => {
    calls++;
    if (calls === 2) throw Object.assign(new Error("EPERM"), { code: "EPERM" });
    return rename(a, b);
  };
  await expect(swapIn(cacheDir, staging, "x", { rename: failing, rm })).rejects.toThrow("EPERM");
  expect(readFileSync(path.join(cacheDir, CURRENT, "marker"), "utf8")).toBe("old");
});

test("swapIn succeeds even if removing the old snapshot fails", async () => {
  const cacheDir = tmp();
  mkdirSync(path.join(cacheDir, CURRENT));
  const staging = path.join(cacheDir, "staging-y");
  mkdirSync(staging);
  writeFileSync(path.join(staging, "marker"), "new");
  const { rename } = await import("node:fs/promises");
  await expect(swapIn(cacheDir, staging, "y", { rename, rm: async () => { throw new Error("EBUSY"); } })).resolves.toBeUndefined();
  expect(readFileSync(path.join(cacheDir, CURRENT, "marker"), "utf8")).toBe("new");
});
