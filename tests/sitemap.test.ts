import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import { filterPageUrls, parseSitemapLocs, urlToPath } from "../src/site/sitemap.js";

const B = "https://design.digital.go.jp/dads/";

test("parseSitemapLocs reads loc entries in order", () => {
  const xml = readFileSync(new URL("./fixtures/sitemap-0.xml", import.meta.url), "utf8");
  const locs = parseSitemapLocs(xml);
  expect(locs).toHaveLength(5);
  expect(locs[0]).toBe(`${B}components/test-button/`);
});

test("filterPageUrls keeps only target pages", () => {
  const input = [
    B,
    `${B}components/button/`,
    `${B}components/button/changelog/`,
    `${B}search/`,
    `${B}updates-dads/`,
    `${B}foundations/color/color-palette/`,
  ];
  expect(filterPageUrls(input)).toEqual([B, `${B}components/button/`, `${B}foundations/color/color-palette/`]);
});

test("urlToPath", () => {
  expect(urlToPath(`${B}components/button/`)).toBe("components/button");
  expect(urlToPath(B)).toBe("index");
});
