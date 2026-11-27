import { readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { buildCatalog } from "../../src/catalog.js";
import { buildSearchIndex, repoSearchDocs } from "../../src/search.js";
import { CURRENT, FILES, pageFile, repoDir, serializePage, sharedDir } from "../../src/snapshot/layout.js";
import { type Manifest, type PageDoc, type RepoComponent, SCHEMA_VERSION } from "../../src/types.js";

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
  page("components/table", "テーブル／データテーブル（概要）", "テーブルは架空です。"),
  page("foundations/color", "カラー", "架空のカラー本文です。"),
  page("foundations/color/color-palette", "カラーパレット", "架空のパレット本文です。"),
  page("foundations/spacing", "スペーシング", "架空の余白の本文です。"),
  page("guidance/long", "長いページ", "あ".repeat(25000)),
];

const exampleDoc = (title: string, head: string[], body: string) =>
  [
    "<!DOCTYPE html>",
    '<html lang="ja">',
    "<head>",
    '<meta charset="UTF-8">',
    `<title>${title}｜ボタン</title>`,
    '<link rel="preconnect" href="https://fonts.googleapis.com">',
    '<link href="https://fonts.googleapis.com/css2?family=Fake+Sans&display=swap" rel="stylesheet">',
    '<link rel="stylesheet" href="../../global.css">',
    ...head,
    "</head>",
    "<body>",
    "",
    body,
    "",
    "</body>",
    "</html>",
    "",
  ].join("\n");

export const HUGE_LINES = 1500;

export const FIXTURE_GLOBAL_CSS = `:root {
  --color-primitive-blue-50: #e8f1fe;
  --font-family-sans: "Noto Sans JP", sans-serif;
  --elevation-1: 0 2px 8px 1px rgba(0, 0, 0, 0.1);
}

html { font-family: var(--font-family-sans); }

.dads-u-visually-hidden { position: absolute !important; }
`;

const repos: Record<"html" | "react", RepoComponent[]> = {
  html: [
    {
      dir: "button",
      files: [
        { path: "button.css", content: '.dads-button { color: blue; }\n.dads-button[data-size="sm"] {}\n.dads-button[data-size="lg"] .dads-button__label {}\n' },
        { path: "button.js", content: "// 架空のスクリプト\n" },
        { path: "button.md", content: "## 仕様（架空）\n\n架空の aria-pressed の説明です。" },
        {
          path: "huge.html",
          content: exampleDoc(
            "大きい作例（架空）",
            ['<link rel="stylesheet" href="button.css">'],
            Array.from({ length: HUGE_LINES }, (_, i) => `<span>架空の行 ${i + 1}</span>`).join("\n"),
          ),
        },
        {
          path: "playground.html",
          content: exampleDoc("プレイグラウンド（架空）", ['<link rel="stylesheet" href="button.css">'], '<button class="dads-button">架空</button>'),
        },
        {
          path: "with-link.html",
          content: exampleDoc(
            "リンク付き（架空）",
            ['<link rel="stylesheet" href="button.css">', '<link rel="stylesheet" href="../breadcrumbs/breadcrumbs.css">', '<script type="module" src="button.js"></script>'],
            '<a class="dads-button" href="#">架空のリンク</a>',
          ),
        },
      ],
    },
    { dir: "breadcrumbs", files: [{ path: "breadcrumbs.md", content: "## 架空" }] },
  ],
  react: [
    {
      dir: "Button",
      files: [
        { path: "Button.stories.tsx", content: "export const Story = () => null; // 架空のボタン作例" },
        { path: "Button.tsx", content: "export const Button = () => null;" },
        { path: "index.ts", content: "export * from './Button';" },
      ],
    },
    { dir: "Breadcrumbs", files: [{ path: "Breadcrumbs.tsx", content: "export const Breadcrumbs = () => null;" }] },
    {
      dir: "Card",
      files: [
        { path: "Card.stories.tsx", content: 'export const Default = () => <div className="card">架空のカード</div>;' },
        { path: "component-spec.md", content: "# 架空の移植計画" },
        { path: "index.ts", content: "export {};\n" },
      ],
    },
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
  await put(path.join(sharedDir(root, "html"), "global.css"), FIXTURE_GLOBAL_CSS);
  const fx = (f: string) => readFileSync(new URL(`./tokens/${f}`, import.meta.url), "utf8");
  await put(path.join(root, FILES.tokensCss), fx("tokens.css"));
  await put(path.join(root, FILES.tokensSimpleCss), fx("tokens-simple.css"));
  await put(path.join(root, FILES.tokensJson), fx("tokens.json"));
  const catalog = buildCatalog(SNAPSHOT_PAGES, repos.html, repos.react, {});
  await put(path.join(root, FILES.components), JSON.stringify(catalog.components));
  const docs = repoSearchDocs(
    [
      { kind: "html", sha: SNAPSHOT_SHA, components: repos.html, shared: [] },
      { kind: "react", sha: SNAPSHOT_SHA, components: repos.react, shared: [] },
    ],
    catalog.components,
  );
  await put(path.join(root, FILES.search), JSON.stringify(buildSearchIndex(SNAPSHOT_PAGES, docs)));
  const manifest: Manifest = {
    schemaVersion: SCHEMA_VERSION,
    fetchedAt,
    repos: { html: SNAPSHOT_SHA, react: SNAPSHOT_SHA },
    tokensVersion: "2.1.0",
    counts: { pages: SNAPSHOT_PAGES.length, components: catalog.components.length },
    warnings: catalog.warnings,
  };
  await put(path.join(root, FILES.manifest), JSON.stringify(manifest));
}
