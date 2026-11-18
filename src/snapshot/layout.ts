import path from "node:path";
import type { PageDoc, RepoKind } from "../types.js";

/** <cacheDir>/current/ が有効なスナップショット */
export const CURRENT = "current";
export const LOCK_FILE = "update.lock";
export const FILES = {
  manifest: "manifest.json",
  components: "components.json",
  search: "search-index.json",
  tokensCss: path.join("tokens", "tokens.css"),
  tokensSimpleCss: path.join("tokens", "tokens-simple.css"),
  tokensJson: path.join("tokens", "tokens.json"),
} as const;

export function pageFile(root: string, pagePath: string): string {
  return path.join(root, "pages", ...pagePath.split("/")) + ".md";
}

export function repoDir(root: string, kind: RepoKind): string {
  return path.join(root, "repos", kind);
}

const KEYS = ["title", "url", "updated", "fetchedAt"] as const;

export function serializePage(p: PageDoc, fetchedAt: string): string {
  const values: Record<(typeof KEYS)[number], string | undefined> = { title: p.title, url: p.url, updated: p.updated, fetchedAt };
  const lines = KEYS.filter((k) => values[k] !== undefined).map((k) => `${k}: ${JSON.stringify(values[k])}`);
  return `---\n${lines.join("\n")}\n---\n${p.markdown}`;
}

export function parsePage(text: string, pagePath: string): PageDoc {
  const lines = text.split("\n");
  if (lines[0] !== "---") throw new Error(`front matter がありません: ${pagePath}`);
  const end = lines.indexOf("---", 1);
  if (end < 0) throw new Error(`front matter が閉じていません: ${pagePath}`);
  const meta: Record<string, string> = {};
  for (const line of lines.slice(1, end)) {
    const i = line.indexOf(": ");
    if (i > 0) meta[line.slice(0, i)] = JSON.parse(line.slice(i + 2)) as string;
  }
  if (!meta.title || !meta.url) throw new Error(`title/url がありません: ${pagePath}`);
  return {
    path: pagePath,
    url: meta.url,
    title: meta.title,
    ...(meta.updated ? { updated: meta.updated } : {}),
    markdown: lines.slice(end + 1).join("\n"),
    resourceLinks: {},
  };
}
