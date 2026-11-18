import type { TokenSnapshot } from "../types.js";

export type TokenCategory = "color" | "typography" | "radius" | "elevation";
export const TOKEN_CATEGORIES: TokenCategory[] = ["color", "typography", "radius", "elevation"];

const CSS_PREFIXES: Record<TokenCategory, string[]> = {
  color: ["--color-"],
  typography: ["--font-", "--line-height-"],
  radius: ["--border-radius-"],
  elevation: ["--elevation-"],
};

const JSON_PATHS: Record<TokenCategory, string[]> = {
  color: ["Color"],
  typography: ["Typography"],
  radius: ["Size", "BorderRadius"],
  elevation: ["Size", "Elevation"],
};

export function selectTokens(t: TokenSnapshot, category: TokenCategory | undefined, format: "css" | "json"): string {
  if (format === "json") {
    if (!category) return JSON.stringify(t.json, null, 2);
    let node: unknown = t.json;
    for (const key of JSON_PATHS[category]) node = (node as Record<string, unknown> | undefined)?.[key];
    return JSON.stringify(node ?? {}, null, 2);
  }
  const decls = t.css
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.startsWith("--"));
  const prefixes = category ? CSS_PREFIXES[category] : ["--"];
  const picked = decls.filter((l) => prefixes.some((p) => l.startsWith(p)));
  return `:root {\n${picked.map((l) => `  ${l}`).join("\n")}\n}`;
}

export function tokenUsage(version: string): string {
  return [
    "### 読み込み方法",
    "",
    "npm:",
    "",
    "```sh",
    "npm install @digital-go-jp/design-tokens",
    "```",
    "",
    "CDN:",
    "",
    "```html",
    `<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@digital-go-jp/design-tokens@${version}/dist/tokens.css">`,
    "```",
  ].join("\n");
}
