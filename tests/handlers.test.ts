import { mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { beforeAll, expect, test } from "vitest";
import { SnapshotStore } from "../src/snapshot/store.js";
import { getComponent, getFoundation, getPage, getSetup, getTokens, listComponents, listFoundations, search } from "../src/tools/handlers.js";
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

const SHA = "abc1234def5678abc1234def5678abc1234def56";
const htmlUrl = (file: string) => `https://github.com/digital-go-jp/design-system-example-components-html/blob/${SHA}/src/components/button/${file}`;
const sourcesOf = (s: string) => s.split("\n\n---\n")[1];

test("html part returns the representative example body and lists the others", () => {
  const out = getComponent(store, { name: "button" }, now);
  const body = bodyOf(out);
  expect(body).toContain("### playground.html");
  expect(body).toContain('<button class="dads-button">架空</button>');
  expect(body).not.toContain("<!DOCTYPE");
  expect(body).not.toContain('<link rel="stylesheet"');
  expect(body).not.toContain("架空のリンク");
  expect(body).not.toContain("架空の行");
  expect(body).toContain("with-link.html: リンク付き（架空）");
  expect(body).toContain('example: "with-link"');
  expect(sourcesOf(out)).toContain(htmlUrl("playground.html"));
  expect(sourcesOf(out)).not.toContain(htmlUrl("with-link.html"));
  expect(sourcesOf(out)).not.toContain(htmlUrl("huge.html"));
});

test("dependency list is shown whatever parts are requested", () => {
  const body = bodyOf(getComponent(store, { name: "button", parts: ["css"] }, now));
  expect(body).toContain("## 読み込むファイル");
  expect(body).toContain("https://fonts.googleapis.com/css2?family=Fake+Sans&display=swap");
  expect(body).toContain("global.css");
  expect(body).toContain("get_setup");
  expect(body).toContain('get_component("breadcrumb", parts: ["css"])');
  expect(body).toContain("button.js");
  expect(body).toMatch(/breadcrumbs\.css.*with-link\.html/);
  expect(body.indexOf("## 読み込むファイル")).toBeLessThan(body.indexOf("## CSS"));
});

test("example picks one example", () => {
  for (const example of ["with-link", "with-link.html"]) {
    const out = getComponent(store, { name: "button", example }, now);
    const body = bodyOf(out);
    expect(body).toContain('<a class="dads-button" href="#">架空のリンク</a>');
    expect(body).toContain('<script type="module" src="button.js"></script>');
    expect(body).not.toContain('<button class="dads-button">架空</button>');
    expect(body).not.toContain("## 概要");
    expect(sourcesOf(out)).toContain(htmlUrl("with-link.html"));
  }
  const missing = getComponent(store, { name: "button", example: "with-lnk" }, now);
  expect(missing).toContain("見つかりませんでした");
  expect(missing).toContain("with-link");
});

test("example all omits whole files that do not fit and says how to get them", () => {
  const out = getComponent(store, { name: "button", parts: ["html"], example: "all" }, now);
  const body = bodyOf(out);
  expect(body.length).toBeLessThanOrEqual(20000);
  expect(body).not.toContain("文字で切りました");
  expect(body).toContain("架空のリンク");
  expect(body).not.toContain("架空の行");
  expect(body).toContain("## 省いた内容");
  expect(body).toContain('get_component("button", parts: ["html"], example: "huge")');
  expect(sourcesOf(out)).toContain(htmlUrl("with-link.html"));
  expect(sourcesOf(out)).not.toContain(htmlUrl("huge.html"));
});

test("a single oversized example is cut at a line boundary with its local path", () => {
  const out = getComponent(store, { name: "button", example: "huge" }, now);
  const body = bodyOf(out);
  expect(body.length).toBeLessThanOrEqual(20000);
  expect(body).toContain("<span>架空の行 1</span>");
  const code = body.split("```html\n")[1].split("\n```")[0];
  for (const line of code.split("\n").filter(Boolean)) expect(line).toMatch(/^<span>架空の行 \d+<\/span>$/);
  expect(body).toContain(`<span>架空の行 ${code.split("\n").filter(Boolean).length}</span>`);
  expect(body).toContain(store.localPath("html", "button", "huge.html"));
  expect(sourcesOf(out)).toContain(htmlUrl("huge.html"));
});

test("file returns a single file", () => {
  const out = getComponent(store, { name: "button", file: "button.js" }, now);
  expect(bodyOf(out)).toContain("架空のスクリプト");
  expect(bodyOf(out)).not.toContain("## 概要");
  expect(getComponent(store, { name: "button", file: "nope.css" }, now)).toContain("button.css");
});

test("js and spec parts", () => {
  expect(getComponent(store, { name: "button", parts: ["js"] }, now)).toContain("```js\n// 架空のスクリプト");
  const spec = bodyOf(getComponent(store, { name: "button", parts: ["spec"] }, now));
  expect(spec).toContain("| data-size | lg, sm |");
  expect(spec).toContain("dads-button");
  expect(spec).toContain("__label");
});

test("react part falls back to stories when there is no component file", () => {
  const card = bodyOf(getComponent(store, { name: "card", parts: ["react"] }, now));
  expect(card).toContain("### Card.stories.tsx");
  expect(card).toContain("架空のカード");
  expect(card).toContain("Storybook");
  expect(card).not.toContain("### index.ts");
  const button = bodyOf(getComponent(store, { name: "button", parts: ["react"] }, now));
  expect(button).not.toContain("Button.stories.tsx");
  expect(button).toContain("### Button.tsx");
});

test("resolves each part of a name split by ／", () => {
  for (const name of ["テーブル", "データテーブル", "テーブル／データテーブル"]) {
    expect(getComponent(store, { name }, now)).toContain("テーブルは架空です。");
  }
});

test("getSetup gives load order, the token gap and global.css without :root", () => {
  const out = getSetup(store, {}, now);
  const body = bodyOf(out);
  expect(body).toContain("https://fonts.googleapis.com/css2?family=Fake+Sans&display=swap");
  const tokensAt = body.indexOf("design-tokens@2.1.0/dist/tokens.css");
  expect(tokensAt).toBeGreaterThan(0);
  expect(tokensAt).toBeLessThan(body.indexOf('href="global.css"'));
  expect(body).toContain("--border-radius-*");
  expect(body).toContain(".dads-u-visually-hidden");
  expect(body).not.toContain("--color-primitive-blue-50: #e8f1fe");
  expect(body).toContain("full: true");
  expect(sourcesOf(out)).toContain("https://github.com/digital-go-jp/design-system-example-components-html/blob/abc1234def5678abc1234def5678abc1234def56/src/global.css");
  expect(sourcesOf(out)).toContain("@digital-go-jp/design-tokens v2.1.0");
  expect(getSetup(store, { full: true }, now)).toContain("--color-primitive-blue-50: #e8f1fe");
});

test("getTokens explains what global.css lacks", () => {
  const out = getTokens(store, {}, now);
  expect(out).toContain("global.css");
  expect(out).toContain("--border-radius-*");
  expect(out).toContain("get_setup");
});

test("search covers repository docs and labels kinds", () => {
  const out = search(store, { query: "aria-pressed" }, now);
  expect(out).toContain("HTML版ドキュメント");
  expect(out).toContain(htmlUrl("button.md"));
  expect(search(store, { query: "無効" }, now)).toContain("ガイドライン");
});

const codeOf = (s: string, lang: string) => bodyOf(s).split(`\`\`\`${lang}\n`)[1].split("\n```")[0].split("\n");

test("a cut file tells how to continue with from_line", () => {
  const raw = store.repos.html.components.find((c) => c.dir === "button")!.files.find((f) => f.path === "huge.html")!.content.split("\n");
  const first = getComponent(store, { name: "button", file: "huge.html" }, now);
  const next = Number(/get_component\("button", file: "huge\.html", from_line: (\d+)\)/.exec(bodyOf(first))![1]);
  expect(codeOf(first, "html").length).toBe(next - 1);
  const second = getComponent(store, { name: "button", file: "huge.html", from_line: next }, now);
  expect(codeOf(second, "html")[0]).toBe(raw[next - 1]);
  expect(bodyOf(second)).toContain(`${next} 行目から`);
  expect(getComponent(store, { name: "button", file: "huge.html", from_line: 99999 }, now)).toContain("行目はありません");
});

test("a cut example tells how to continue with from_line", () => {
  const first = getComponent(store, { name: "button", example: "huge" }, now);
  const next = Number(/get_component\("button", example: "huge", from_line: (\d+)\)/.exec(bodyOf(first))![1]);
  const second = getComponent(store, { name: "button", example: "huge", from_line: next }, now);
  expect(codeOf(second, "html")[0]).toBe(`<span>架空の行 ${next}</span>`);
});

test("default answer mentions the other ways to call get_component", () => {
  const body = bodyOf(getComponent(store, { name: "button" }, now));
  for (const s of ['parts: ["spec"]', 'parts: ["js"]', "example:", "file:"]) expect(body).toContain(s);
});

test("search by file name points to the tool that returns the file", () => {
  expect(search(store, { query: "global.css" }, now)).toContain("get_setup");
  expect(search(store, { query: "global.css" }, now)).not.toContain("一致するページはありませんでした");
  expect(search(store, { query: "button.css" }, now)).toContain('get_component("button", file: "button.css")');
});
