import { mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { beforeAll, expect, test } from "vitest";
import { SnapshotStore } from "../src/snapshot/store.js";
import { getComponent, getFoundation, getPage, getTokens, listComponents, listFoundations, search } from "../src/tools/handlers.js";
import { UPDATE_COMMAND } from "../src/version.js";
import { writeFixtureSnapshot } from "./fixtures/snapshot.js";

let store: SnapshotStore;
const now = new Date("2026-11-18T12:00:00Z");
beforeAll(async () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "dads-h-"));
  await writeFixtureSnapshot(dir);
  store = (await SnapshotStore.open(dir))!;
});

const bodyOf = (s: string) => s.split("\n\n---\n")[0];

test("resolves component names across notations", () => {
  const base = bodyOf(getComponent(store, { name: "button" }, now));
  for (const n of ["Button", "ボタン", "ボタン（概要）", "ＢＵＴＴＯＮ"]) expect(bodyOf(getComponent(store, { name: n }, now))).toBe(base);
  expect(getComponent(store, { name: "Breadcrumbs" }, now)).toContain("パンくずリストは架空です。");
});

test("getComponent default parts", () => {
  const out = getComponent(store, { name: "button" }, now);
  expect(out).toContain("ボタンは架空の操作部品です。");
  expect(out).toContain("架空の使い方の本文です。");
  expect(out).toContain("架空のアクセシビリティ本文です。");
  expect(out).toContain("```html");
  expect(out).toContain("## 仕様（架空）");
  expect(out).not.toContain("```tsx");
  expect(out).not.toContain(".dads-button { color");
});

test("getComponent react and css parts", () => {
  const out = getComponent(store, { name: "button", parts: ["react", "css"] }, now);
  expect(out).toContain("@digital-go-jp/tailwind-theme-plugin");
  expect(out).toContain("```tsx");
  expect(out).toContain("```css");
  expect(out).not.toContain("架空の使い方の本文です。");
});

test("missing part is reported", () => {
  expect(getComponent(store, { name: "breadcrumb", parts: ["usage"] }, now)).toContain("（usage はありません）");
});

test("unknown component suggests", () => {
  const out = getComponent(store, { name: "buton" }, now);
  expect(out).toContain("見つかりませんでした");
  expect(out).toContain("button");
});

test("attribution", () => {
  const out = getComponent(store, { name: "button" }, now);
  expect(out.trimEnd().endsWith("取得日: 2026-11-18")).toBe(true);
  expect(out).toContain(
    "出典: 「ボタン（概要）」（デジタル庁デザインシステム）https://design.digital.go.jp/dads/components/button/ を dads-mcp が取得・整形",
  );
  expect(out).toContain(
    "出典: digital-go-jp/design-system-example-components-html（MIT License）https://github.com/digital-go-jp/design-system-example-components-html/blob/abc1234def5678abc1234def5678abc1234def56/src/components/button/playground.html commit abc1234",
  );
});

test("truncates long output", () => {
  const out = getPage(store, { path: "guidance/long" }, now);
  const body = bodyOf(out);
  expect(body).toContain("20000 文字で切りました");
  expect(body.length).toBeLessThan(20200);
});

test("stale notice", () => {
  expect(listComponents(store, {}, new Date("2026-12-31T00:00:00Z"))).toContain(UPDATE_COMMAND);
  expect(listComponents(store, {}, new Date("2026-11-30T00:00:00Z"))).not.toContain(UPDATE_COMMAND);
});

test("listComponents table", () => {
  const out = listComponents(store, {}, now);
  expect(out).toContain("| slug | 名前 | 概要 | ガイドライン | HTML | React |");
  expect(out).toMatch(/\| button \| ボタン \| ボタンは架空の操作部品です。 \| ○ \| ○ \| ○ \|/);
});

test("foundations", () => {
  expect(listFoundations(store, {}, now)).toContain("color-palette");
  expect(getFoundation(store, { topic: "color" }, now)).toContain("架空のカラー本文です。");
  expect(getFoundation(store, { topic: "color", subpage: "color-palette" }, now)).toContain("架空のパレット本文です。");
  expect(getFoundation(store, { topic: "colour" }, now)).toContain("color");
});

test("tokens", () => {
  const out = getTokens(store, { category: "color" }, now);
  expect(out).toContain("--color-primitive-blue-50");
  expect(out).toContain("design-tokens@2.1.0/dist/tokens.css");
  expect(out).toContain("出典: @digital-go-jp/design-tokens v2.1.0（MIT License）");
  expect(JSON.parse(getTokens(store, { category: "radius", format: "json" }, now).split("```json\n")[1].split("\n```")[0])).toHaveProperty("Full");
});

test("spacing tokens redirect", () => {
  expect(getTokens(store, { category: "spacing" }, now)).toContain("get_foundation");
});

test("unknown token category suggests", () => {
  expect(getTokens(store, { category: "colors" }, now)).toContain("color");
});

test("search hit and no hit", () => {
  expect(search(store, { query: "無効" }, now)).toContain("https://design.digital.go.jp/dads/components/button/usage/");
  expect(search(store, { query: "存在しない語" }, now)).toContain("一致するページはありませんでした");
});

test("getPage accepts url and path forms", () => {
  for (const p of ["foundations/spacing", "/foundations/spacing/", "dads/foundations/spacing", "https://design.digital.go.jp/dads/foundations/spacing/"]) {
    expect(getPage(store, { path: p }, now)).toContain("架空の余白の本文です。");
  }
  expect(getPage(store, { path: "foundations/spacin" }, now)).toContain("foundations/spacing");
});
