import { readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { buildCatalog } from "../../src/catalog.js";
import { buildSearchIndex } from "../../src/search.js";
import { CURRENT, FILES, pageFile, repoDir, serializePage } from "../../src/snapshot/layout.js";
import type { Manifest, PageDoc, RepoComponent } from "../../src/types.js";

export const SNAPSHOT_SHA = "abc1234def5678abc1234def5678abc1234def56";
const SITE = "https://design.digital.go.jp/dads/";

const page = (p: string, title: string, body: string, resourceLinks: PageDoc["resourceLinks"] = {}): PageDoc => ({
  path: p,
  url: p === "index" ? SITE : `${SITE}${p}/`,
  title,
  updated: "2026-10-21",
  markdown: `# ${title}\n\n${body}\n`,
  resourceLinks,
});

export const SNAPSHOT_PAGES: PageDoc[] = [
  page("index", "デジタル庁デザインシステムβ版", "架空のトップページです。"),
  page("components/button", "ボタン（概要）", "ボタンは架空の操作部品です。二文目です。"),
  page("components/button/usage", "ボタン（使い方）", "## 無効状態\n\n架空の使い方の本文です。"),
  page("components/button/accessibility", "ボタン（アクセシビリティ）", "架空のアクセシビリティ本文です。"),
  page("components/breadcrumb", "パンくずリスト（概要）", "パンくずリストは架空です。", { html: "breadcrumbs", react: "Breadcrumbs" }),
  page("foundations/color", "カラー", "架空のカラー本文です。"),
  page("foundations/color/color-palette", "カラーパレット", "架空のパレット本文です。"),
  page("foundations/spacing", "スペーシング", "架空の余白の本文です。"),
  page("guidance/long", "長いページ", "あ".repeat(25000)),
];

const repos: Record<"html" | "react", RepoComponent[]> = {
  html: [
    {
      dir: "button",
      files: [
        { path: "button.css", content: ".dads-button { color: blue; }" },
        { path: "button.md", content: "## 仕様（架空）" },
        { path: "playground.html", content: '<button class="dads-button">架空</button>' },
      ],
    },
    { dir: "breadcrumbs", files: [{ path: "breadcrumbs.md", content: "## 架空" }] },
  ],
  react: [
    {
      dir: "Button",
      files: [
        { path: "Button.tsx", content: "export const Button = () => null;" },
        { path: "index.ts", content: "export * from './Button';" },
      ],
    },
    { dir: "Breadcrumbs", files: [{ path: "Breadcrumbs.tsx", content: "export const Breadcrumbs = () => null;" }] },
  ],
};

async function put(file: string, content: string) {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, content, "utf8");
}

export async function writeFixtureSnapshot(cacheDir: string, opts: { fetchedAt?: string } = {}): Promise<void> {
  const root = path.join(cacheDir, CURRENT);
  const fetchedAt = opts.fetchedAt ?? "2026-11-18T00:00:00.000Z";
  for (const p of SNAPSHOT_PAGES) await put(pageFile(root, p.path), serializePage(p, fetchedAt));
  for (const kind of ["html", "react"] as const)
    for (const c of repos[kind]) for (const f of c.files) await put(path.join(repoDir(root, kind), c.dir, f.path), f.content);
  const fx = (f: string) => readFileSync(new URL(`./tokens/${f}`, import.meta.url), "utf8");
  await put(path.join(root, FILES.tokensCss), fx("tokens.css"));
  await put(path.join(root, FILES.tokensSimpleCss), fx("tokens-simple.css"));
  await put(path.join(root, FILES.tokensJson), fx("tokens.json"));
  const catalog = buildCatalog(SNAPSHOT_PAGES, repos.html, repos.react, {});
  await put(path.join(root, FILES.components), JSON.stringify(catalog.components));
  await put(path.join(root, FILES.search), JSON.stringify(buildSearchIndex(SNAPSHOT_PAGES)));
  const manifest: Manifest = {
    schemaVersion: 1,
    fetchedAt,
    repos: { html: SNAPSHOT_SHA, react: SNAPSHOT_SHA },
    tokensVersion: "2.1.0",
    counts: { pages: SNAPSHOT_PAGES.length, components: catalog.components.length },
    warnings: catalog.warnings,
  };
  await put(path.join(root, FILES.manifest), JSON.stringify(manifest));
}
