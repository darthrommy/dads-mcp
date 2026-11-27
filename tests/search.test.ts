import { expect, test } from "vitest";
import { buildSearchIndex, repoSearchDocs, searchIndex } from "../src/search.js";
import type { PageDoc } from "../src/types.js";

const doc = (path: string, title: string, markdown: string): PageDoc => ({
  path,
  url: `https://design.digital.go.jp/dads/${path}/`,
  title,
  markdown,
  resourceLinks: {},
});

const pages = [
  doc("components/button", "ボタン（概要）", "# ボタン（概要）\n\nボタンの架空の説明。button 要素を使う。\n\n## 無効状態\n\nボタンを無効にする架空の説明。\n\n## サイズ\n\n大きさの架空の説明。"),
  doc("components/input", "インプット（概要）", "# インプット（概要）\n\n入力欄の架空の説明。\n\n## 状態\n\n入力欄を無効にすると灰色になる架空の説明。無効の場合は注意。"),
  doc("foundations/color", "カラー", "# カラー\n\n色の架空の説明。"),
];
const index = buildSearchIndex(pages);

test("finds Japanese term", () => {
  const hits = searchIndex(index, "無効", 10);
  expect(hits.length).toBe(2);
  expect(hits.every((h) => h.snippet.includes("無効"))).toBe(true);
});

test("AND across terms", () => {
  const hits = searchIndex(index, "ボタン 無効", 10);
  expect(hits).toHaveLength(1);
  expect(hits[0]).toMatchObject({ title: "ボタン（概要）", heading: "無効状態", url: "https://design.digital.go.jp/dads/components/button/" });
});

test("full-width and case insensitive", () => {
  const hits = searchIndex(index, "ＢＵＴＴＯＮ", 10);
  expect(hits).toHaveLength(1);
  expect(hits[0].heading).toBe("ボタン（概要）");
});

test("ranks heading match higher", () => {
  const hits = searchIndex(index, "無効", 10);
  expect(hits[0].heading).toBe("無効状態");
});

test("respects limit", () => {
  expect(searchIndex(index, "架空", 2)).toHaveLength(2);
});

test("empty query returns []", () => {
  expect(searchIndex(index, "   ", 10)).toEqual([]);
});

test("single character term", () => {
  expect(searchIndex(index, "欄", 10).map((h) => h.title)).toEqual(["インプット（概要）", "インプット（概要）"]);
});

test("searches repository docs with their kind", () => {
  const docs = repoSearchDocs(
    [
      {
        kind: "html",
        sha: "abc1234",
        components: [
          {
            dir: "button",
            files: [
              { path: "button.md", content: "# 架空\n\n## 状態\n\naria-pressed の架空の説明。" },
              { path: "button.css", content: "aria-pressed" },
            ],
          },
        ],
        shared: [],
      },
      { kind: "react", components: [{ dir: "Button", files: [{ path: "component-spec.md", content: "aria-pressed を React で使う架空の説明。" }] }], shared: [] },
    ],
    [{ slug: "button", nameJa: "ボタン", summary: "", htmlDir: "button", reactDir: "Button", pages: {} }],
  );
  const hits = searchIndex(buildSearchIndex(pages, docs), "aria-pressed", 10);
  expect(hits.map((h) => [h.kind, h.title, h.heading, h.url])).toEqual([
    ["html", "ボタン button/button.md", "状態", "https://github.com/digital-go-jp/design-system-example-components-html/blob/abc1234/src/components/button/button.md"],
    [
      "react",
      "ボタン Button/component-spec.md",
      "ボタン Button/component-spec.md",
      "https://github.com/digital-go-jp/design-system-example-components-react/blob/main/src/components/Button/component-spec.md",
    ],
  ]);
  expect(hits[0].ref).toEqual({ dir: "button", file: "button.md" });
  expect(searchIndex(buildSearchIndex(pages, docs), "無効", 10).every((h) => h.kind === "guide")).toBe(true);
});

test("index survives JSON round trip", () => {
  const copy = JSON.parse(JSON.stringify(index));
  expect(searchIndex(copy, "ボタン 無効", 10)).toEqual(searchIndex(index, "ボタン 無効", 10));
});
