import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import type { Http } from "../src/http.js";
import { fetchTokens } from "../src/tokens/fetch.js";
import { selectTokens, tokenUsage } from "../src/tokens/select.js";
import type { TokenSnapshot } from "../src/types.js";
import { fixtureText, makeTokensTarball } from "./helpers.js";

const snap: TokenSnapshot = {
  version: "2.1.0",
  css: readFileSync(fixtureText("tokens/tokens.css"), "utf8"),
  simpleCss: readFileSync(fixtureText("tokens/tokens-simple.css"), "utf8"),
  json: JSON.parse(readFileSync(fixtureText("tokens/tokens.json"), "utf8")),
};

test("selects color css", () => {
  const out = selectTokens(snap, "color", "css");
  expect(out).toContain("--color-primitive-blue-50");
  expect(out).not.toContain("--font-size-16");
});

test("selects typography css", () => {
  const out = selectTokens(snap, "typography", "css");
  expect(out).toContain("--font-size-16");
  expect(out).toContain("--line-height-150");
  expect(out).not.toContain("--color-");
});

test("all css when category omitted", () => {
  const out = selectTokens(snap, undefined, "css");
  expect(out).toContain("--color-primitive-blue-50");
  expect(out).toContain("--elevation-1");
});

test("selects radius json", () => {
  expect(JSON.parse(selectTokens(snap, "radius", "json"))).toHaveProperty("Full");
});

test("fetchTokens", async () => {
  const tgz = await makeTokensTarball();
  const http: Http = {
    json: async <T>(url: string) => {
      expect(url).toBe("https://registry.npmjs.org/@digital-go-jp/design-tokens/latest");
      return { version: "2.1.0", dist: { tarball: "https://registry.example/t.tgz" } } as T;
    },
    buffer: async (url) => {
      expect(url).toBe("https://registry.example/t.tgz");
      return tgz;
    },
    text: async (url) => {
      expect(url).toBe("https://raw.githubusercontent.com/digital-go-jp/design-tokens/v2.1.0/figma/tokens.json");
      return readFileSync(fixtureText("tokens/tokens.json"), "utf8");
    },
  };
  const t = await fetchTokens(http);
  expect(t.version).toBe("2.1.0");
  expect(t.css).toContain("--color-primitive-blue-50");
  expect(t.simpleCss).toContain(":root");
  expect(t.json).toHaveProperty("Size");
});

test("tokenUsage", () => {
  expect(tokenUsage("2.1.0")).toContain("design-tokens@2.1.0/dist/tokens.css");
  expect(tokenUsage("2.1.0")).toContain("npm install @digital-go-jp/design-tokens");
});
