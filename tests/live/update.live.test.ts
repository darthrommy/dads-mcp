import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, expect, test } from "vitest";
import { createHttp } from "../../src/http.js";
import { filterPageUrls, parseSitemapLocs, SITE_BASE } from "../../src/site/sitemap.js";
import { SnapshotStore } from "../../src/snapshot/store.js";
import { runUpdate } from "../../src/snapshot/update.js";
import { getComponent } from "../../src/tools/handlers.js";
import type { Manifest } from "../../src/types.js";

const cacheDir = mkdtempSync(path.join(os.tmpdir(), "dads-live-"));
const http = createHttp();
let manifest: Manifest;
let store: SnapshotStore;

beforeAll(async () => {
  manifest = await runUpdate({ cacheDir, http, log: (m) => console.error(m) });
  store = (await SnapshotStore.open(cacheDir))!;
  console.error(`pages=${manifest.counts.pages} components=${manifest.counts.components} warnings=${manifest.warnings.length}`);
  for (const w of manifest.warnings) console.error(`  ${w}`);
});
afterAll(() => rmSync(cacheDir, { recursive: true, force: true }));

test("converts at least 80% of pages", async () => {
  const sitemaps = parseSitemapLocs(await http.text(`${SITE_BASE}sitemap-index.xml`));
  const urls = filterPageUrls((await Promise.all(sitemaps.map(async (u) => parseSitemapLocs(await http.text(u))))).flat());
  expect(manifest.counts.pages / urls.length).toBeGreaterThanOrEqual(0.8);
  const empty = store.listPages("").filter((p) => p.markdown.replace(/^# .*$/m, "").trim().length === 0);
  expect(empty.map((p) => p.path)).toEqual([]);
});

test("button has guideline, html and react", () => {
  const out = getComponent(store, { name: "button", parts: ["overview", "html", "react"] }, new Date());
  expect(out).toContain("dads-button");
  expect(out).toContain("```tsx");
  expect(out).not.toContain("（overview はありません）");
});

test("tokens match npm version", async () => {
  const latest = await http.json<{ version: string }>("https://registry.npmjs.org/@digital-go-jp/design-tokens/latest");
  expect(manifest.tokensVersion).toBe(latest.version);
});
