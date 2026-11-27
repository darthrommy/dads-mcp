import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import { analyzeGlobalCss } from "../src/globalcss.js";

const tokensCss = readFileSync(new URL("./fixtures/tokens/tokens.css", import.meta.url), "utf8");
const globalCss = `:root {
  --color-primitive-blue-50: #e8f1fe;
  --font-family-sans: "Noto Sans JP", sans-serif;
  --elevation-1: 0 2px 8px 1px rgba(0, 0, 0, 0.1);
}

html { font-family: var(--font-family-sans); }

:focus-visible { outline: 4px solid; }

.dads-u-visually-hidden { position: absolute !important; }

:where(.dads-u-focus-outline):focus-visible { outline: 0; }
`;

test("compares :root variables with tokens.css", () => {
  const a = analyzeGlobalCss(globalCss, tokensCss);
  expect(a.rootFamilies).toEqual([
    { family: "--color-primitive-*", count: 1 },
    { family: "--font-family-*", count: 1 },
    { family: "--elevation-*", count: 1 },
  ]);
  expect(a.tokensOnlyFamilies.map((f) => f.family)).toEqual([
    "--color-neutral-*",
    "--color-semantic-*",
    "--font-size-*",
    "--font-weight-*",
    "--line-height-*",
    "--border-radius-*",
  ]);
  expect(a.differing).toEqual([]);
  expect(a.utilities).toEqual(["dads-u-visually-hidden", "dads-u-focus-outline"]);
  expect(a.withoutRoot.startsWith("html { font-family")).toBe(true);
  expect(a.withoutRoot).not.toContain("--color-primitive-blue-50");
});

test("reports variables whose values differ or are missing in tokens.css", () => {
  const a = analyzeGlobalCss(":root {\n  --color-primitive-blue-50: #000;\n  --only-here: 1px;\n}\n", tokensCss);
  expect(a.differing).toEqual(["--color-primitive-blue-50", "--only-here"]);
});
