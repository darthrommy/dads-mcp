import { expect, test } from "vitest";
import { buildCatalog, normalizeName } from "../src/catalog.js";
import type { PageDoc, RepoComponent } from "../src/types.js";

const page = (path: string, title: string, markdown = `# ${title}\n\n本文です。`, resourceLinks: PageDoc["resourceLinks"] = {}): PageDoc => ({
  path,
  url: `https://design.digital.go.jp/dads/${path}/`,
  title,
  markdown,
  resourceLinks,
});
const repo = (...dirs: string[]): RepoComponent[] => dirs.map((dir) => ({ dir, files: [] }));

test("normalizeName", () => {
  expect(normalizeName("Breadcrumbs")).toBe("breadcrumb");
  expect(normalizeName("ＢＵＴＴＯＮ")).toBe("button");
  expect(normalizeName("chip-label")).toBe("chiplabel");
});

test("maps via resource links", () => {
  const { components } = buildCatalog(
    [page("components/breadcrumb", "パンくずリスト（概要）", undefined, { html: "breadcrumbs", react: "Breadcrumbs" })],
    repo("breadcrumbs"),
    repo("Breadcrumbs"),
    {},
  );
  expect(components[0]).toMatchObject({ slug: "breadcrumb", htmlDir: "breadcrumbs", reactDir: "Breadcrumbs" });
});

test("maps via normalized name", () => {
  const { components } = buildCatalog([page("components/button", "ボタン（概要）")], repo("button"), repo("Button"), {});
  expect(components[0]).toMatchObject({ htmlDir: "button", reactDir: "Button" });
});

test("overrides win", () => {
  const { components } = buildCatalog([page("components/button", "ボタン（概要）")], repo("button"), repo("Button", "Btn"), {
    button: { react: "Btn" },
  });
  expect(components[0].reactDir).toBe("Btn");
});

test("drops mapping to a dir that does not exist, with warning", () => {
  const { components, warnings } = buildCatalog(
    [page("components/button", "ボタン（概要）", undefined, { react: "Gone" })],
    repo(),
    repo(),
    {},
  );
  expect(components[0].reactDir).toBeUndefined();
  expect(warnings.join("\n")).toContain("Gone");
});

test("adds repo-only components with warning", () => {
  const { components, warnings } = buildCatalog([], repo(), repo("Calendar"), {});
  expect(components).toEqual([
    { slug: "calendar", nameJa: "Calendar", summary: "（ガイドラインページなし）", reactDir: "Calendar", pages: {} },
  ]);
  expect(warnings.join("\n")).toContain('React版 "Calendar"');
});

test("merges html and react repo-only dirs into one entry", () => {
  const { components } = buildCatalog([], repo("chip-label"), repo("ChipLabel"), {});
  expect(components).toHaveLength(1);
  expect(components[0]).toMatchObject({ slug: "chip-label", htmlDir: "chip-label", reactDir: "ChipLabel" });
});

test("extracts nameJa, summary and subpages", () => {
  const { components } = buildCatalog(
    [
      page("components/button", "ボタン（概要）", "# ボタン（概要）\n\n![a](x)\n\nボタンは架空です。二文目。"),
      page("components/button/usage", "ボタン（使い方）"),
      page("components/button/accessibility", "ボタン（アクセシビリティ）"),
      page("components/button/example", "ボタン（例）"),
    ],
    repo(),
    repo(),
    {},
  );
  expect(components).toHaveLength(1);
  expect(components[0]).toMatchObject({
    nameJa: "ボタン",
    summary: "ボタンは架空です。",
    pages: { overview: "components/button", usage: "components/button/usage", accessibility: "components/button/accessibility" },
  });
});

test("sorted by slug", () => {
  const { components } = buildCatalog([page("components/z", "Z（概要）"), page("components/a", "A（概要）")], repo(), repo(), {});
  expect(components.map((c) => c.slug)).toEqual(["a", "z"]);
});
