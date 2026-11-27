import { cpSync, mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import * as tar from "tar";
import { REPOS } from "../src/repos/github.js";
import type { RepoKind } from "../src/types.js";

async function pack(cwd: string, entry: string): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const c of tar.c({ gzip: true, cwd }, [entry]) as AsyncIterable<Buffer>) chunks.push(c);
  return Buffer.concat(chunks);
}

export async function makeRepoTarball(kind: RepoKind): Promise<Buffer> {
  const dir = mkdtempSync(path.join(os.tmpdir(), "dads-tgz-"));
  const root = `${REPOS[kind]}-main`;
  cpSync(new URL(`./fixtures/repos/${kind}`, import.meta.url), path.join(dir, root, "src", "components"), { recursive: true });
  if (kind === "html") cpSync(new URL("./fixtures/repos-shared/html/global.css", import.meta.url), path.join(dir, root, "src", "global.css"));
  return pack(dir, root);
}

export async function makeTokensTarball(): Promise<Buffer> {
  const dir = mkdtempSync(path.join(os.tmpdir(), "dads-npm-"));
  mkdirSync(path.join(dir, "package", "dist"), { recursive: true });
  cpSync(new URL("./fixtures/tokens/tokens.css", import.meta.url), path.join(dir, "package", "dist", "tokens.css"));
  cpSync(new URL("./fixtures/tokens/tokens-simple.css", import.meta.url), path.join(dir, "package", "dist", "tokens-simple.css"));
  writeFileSync(path.join(dir, "package", "package.json"), "{}");
  return pack(dir, "package");
}

export const fixtureText = (rel: string) => new URL(`./fixtures/${rel}`, import.meta.url);

import { readFileSync } from "node:fs";
import type { Http } from "../src/http.js";
import { HttpError } from "../src/http.js";
import { tarballUrl } from "../src/repos/github.js";

const SITE = "https://design.digital.go.jp/dads/";
export const FIXTURE_PAGES: Record<string, string> = {
  "components/test-button/": "component-overview.html",
  "components/test-button/usage/": "component-usage.html",
  "components/test-button/accessibility/": "component-usage.html",
  "foundations/test-color/": "foundation.html",
  "guidance/test-guide/": "foundation.html",
};
export const FIXTURE_SHA = "abc1234def5678abc1234def5678abc1234def56";

/** サイト・GitHub・npm を模した偽 Http。override で URL ごとの挙動を差し替えられる */
export async function makeFakeHttp(override?: (url: string) => Promise<unknown> | undefined): Promise<Http & { calls: string[] }> {
  const htmlTgz = await makeRepoTarball("html");
  const reactTgz = await makeRepoTarball("react");
  const tokensTgz = await makeTokensTarball();
  const sitemap = `<?xml version="1.0"?><urlset>${[...Object.keys(FIXTURE_PAGES), "components/test-button/changelog/", "search/"]
    .map((p) => `<url><loc>${SITE}${p}</loc></url>`)
    .join("")}</urlset>`;
  const calls: string[] = [];
  const route = async (url: string): Promise<unknown> => {
    calls.push(url);
    const o = override?.(url);
    if (o !== undefined) return o;
    if (url === `${SITE}sitemap-index.xml`) return `<sitemapindex><sitemap><loc>${SITE}sitemap-0.xml</loc></sitemap></sitemapindex>`;
    if (url === `${SITE}sitemap-0.xml`) return sitemap;
    if (url.startsWith(SITE)) {
      const f = FIXTURE_PAGES[url.slice(SITE.length)];
      if (f) return readFileSync(fixtureText(`site/${f}`), "utf8");
    }
    if (url === tarballUrl("html")) return htmlTgz;
    if (url === tarballUrl("react")) return reactTgz;
    if (url.startsWith("https://api.github.com/repos/")) return { sha: FIXTURE_SHA };
    if (url === "https://registry.npmjs.org/@digital-go-jp/design-tokens/latest")
      return { version: "2.1.0", dist: { tarball: "https://registry.example/tokens.tgz" } };
    if (url === "https://registry.example/tokens.tgz") return tokensTgz;
    if (url.endsWith("/figma/tokens.json")) return readFileSync(fixtureText("tokens/tokens.json"), "utf8");
    throw new HttpError(404, url);
  };
  return {
    calls,
    text: async (url) => (await route(url)) as string,
    buffer: async (url) => (await route(url)) as Buffer,
    json: async <T>(url: string) => (await route(url)) as T,
  };
}
