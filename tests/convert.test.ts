import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { convertPage } from "../src/site/convert.js";

const fx = (name: string) => readFileSync(new URL(`./fixtures/site/${name}`, import.meta.url), "utf8");
const B = "https://design.digital.go.jp/dads/";

describe("convertPage(component-overview)", () => {
  const doc = convertPage(fx("component-overview.html"), `${B}components/test-button/`);

  test("metadata", () => {
    expect(doc.path).toBe("components/test-button");
    expect(doc.url).toBe(`${B}components/test-button/`);
    expect(doc.title).toBe("テストボタン（概要）");
    expect(doc.updated).toBe("2026-10-21");
  });

  test("resource links", () => {
    expect(doc.resourceLinks).toEqual({ html: "test-button", react: "TestButton" });
  });

  test("markdown starts with title heading", () => {
    expect(doc.markdown.startsWith("# テストボタン（概要）\n\n")).toBe(true);
  });

  test("absolute image and link urls", () => {
    expect(doc.markdown).toContain(`![架空のスクリーンショット](${B}images/x.png)`);
    expect(doc.markdown).toContain(`(${B}foundations/color/)`);
  });

  test("removes chrome", () => {
    for (const s of ["このページの目次", "各種リソース", "ソースコード（GitHub）", "前のページの架空ラベル", "次のページの架空ラベル", "スクリプトの中身", "color:red", "サイトヘッダー", "Digital Agency"]) {
      expect(doc.markdown).not.toContain(s);
    }
  });

  test("keeps content after resources section", () => {
    expect(doc.markdown).toContain("## 架空の補足");
    expect(doc.markdown).toContain("テスト用の架空の説明文です。");
  });
});

test("convertPage(foundation) renders GFM table", () => {
  const doc = convertPage(fx("foundation.html"), `${B}foundations/test-color/`);
  expect(doc.title).toBe("テストカラー");
  expect(doc.markdown).toMatch(/\| 名前 \| 値 \|/);
  expect(doc.markdown).toMatch(/\| 架空ブルー \| #0017c1 \|/);
  expect(doc.resourceLinks).toEqual({});
});

test("throws when page has no main element", () => {
  expect(() => convertPage("<html><head><title>X｜デジタル庁デザインシステムβ版</title></head><body><div id=app></div></body></html>", "https://design.digital.go.jp/dads/x/")).toThrow();
});

test("throws when converted body is empty", () => {
  expect(() => convertPage("<html><head><title>X｜デジタル庁デザインシステムβ版</title></head><body><main><div class=\"dads-main__body\"><div class=\"prose\"></div></div></main></body></html>", "https://design.digital.go.jp/dads/x/")).toThrow();
});

test("throws when title is empty", () => {
  expect(() => convertPage("<html><body><main><p>本文</p></main></body></html>", "https://design.digital.go.jp/dads/x/")).toThrow();
});
