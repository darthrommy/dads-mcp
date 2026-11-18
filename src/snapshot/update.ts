import { readFileSync } from "node:fs";
import { mkdir, open, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { buildCatalog, type NameOverrides } from "../catalog.js";
import type { Http } from "../http.js";
import { fetchRepo } from "../repos/github.js";
import { buildSearchIndex } from "../search.js";
import { convertPage } from "../site/convert.js";
import { filterPageUrls, parseSitemapLocs, SITE_BASE } from "../site/sitemap.js";
import { fetchTokens } from "../tokens/fetch.js";
import { type Manifest, type PageDoc, type RepoSnapshot, SCHEMA_VERSION } from "../types.js";
import { CURRENT, FILES, LOCK_FILE, pageFile, repoDir, serializePage } from "./layout.js";

export class UpdateInProgressError extends Error {
  constructor() {
    super("別の更新が実行中です");
    this.name = "UpdateInProgressError";
  }
}
export class UpdateAbortedError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "UpdateAbortedError";
  }
}

export interface UpdateDeps {
  cacheDir: string;
  http: Http;
  log?: (msg: string) => void;
  now?: () => Date;
  overrides?: NameOverrides;
}

const LOCK_STALE_MS = 10 * 60 * 1000;
const FAILURE_RATIO = 0.2;

function defaultOverrides(): NameOverrides {
  return JSON.parse(readFileSync(new URL("../../data/name-overrides.json", import.meta.url), "utf8")) as NameOverrides;
}

async function acquireLock(file: string): Promise<void> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const h = await open(file, "wx");
      await h.writeFile(String(process.pid));
      await h.close();
      return;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e;
      const age = Date.now() - (await stat(file)).mtimeMs;
      if (age < LOCK_STALE_MS) throw new UpdateInProgressError();
      await rm(file, { force: true });
    }
  }
  throw new UpdateInProgressError();
}

const reason = (e: unknown) => (e instanceof Error ? e.message : String(e));

async function writeText(file: string, content: string): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, content, "utf8");
}

export async function runUpdate(deps: UpdateDeps): Promise<Manifest> {
  const { cacheDir, http } = deps;
  const log = deps.log ?? (() => {});
  const now = deps.now ?? (() => new Date());
  await mkdir(cacheDir, { recursive: true });
  const lock = path.join(cacheDir, LOCK_FILE);
  await acquireLock(lock);
  const stamp = `${Date.now()}-${process.pid}`;
  const staging = path.join(cacheDir, `staging-${stamp}`);
  try {
    const fetchedAt = now().toISOString();
    const warnings: string[] = [];

    let urls: string[];
    try {
      const sitemaps = parseSitemapLocs(await http.text(`${SITE_BASE}sitemap-index.xml`));
      urls = filterPageUrls((await Promise.all(sitemaps.map(async (u) => parseSitemapLocs(await http.text(u))))).flat());
    } catch (e) {
      throw new UpdateAbortedError(`サイトマップを取得できませんでした: ${reason(e)}`, { cause: e });
    }
    if (urls.length === 0) throw new UpdateAbortedError("サイトマップに対象ページがありません");

    let done = 0;
    const results = await Promise.all(
      urls.map(async (url): Promise<PageDoc | undefined> => {
        try {
          return convertPage(await http.text(url), url);
        } catch (e) {
          warnings.push(`ページ取得失敗: ${url} (${reason(e)})`);
          return undefined;
        } finally {
          done++;
          if (done % 20 === 0 || done === urls.length) log(`ページ ${done}/${urls.length}`);
        }
      }),
    );
    const pages = results.filter((p): p is PageDoc => p !== undefined);
    const failed = urls.length - pages.length;
    if (failed / urls.length >= FAILURE_RATIO) {
      throw new UpdateAbortedError(`ページの取得に ${failed}/${urls.length} 件失敗したため中止しました`);
    }

    let html: RepoSnapshot, react: RepoSnapshot, tokens;
    try {
      log("GitHub と npm からコードとトークンを取得中");
      [html, react, tokens] = await Promise.all([fetchRepo(http, "html"), fetchRepo(http, "react"), fetchTokens(http)]);
    } catch (e) {
      throw new UpdateAbortedError(`コードまたはトークンを取得できませんでした: ${reason(e)}`, { cause: e });
    }

    const catalog = buildCatalog(pages, html.components, react.components, deps.overrides ?? defaultOverrides());
    warnings.push(...catalog.warnings);

    for (const p of pages) await writeText(pageFile(staging, p.path), serializePage(p, fetchedAt));
    for (const repo of [html, react]) {
      for (const c of repo.components) {
        for (const f of c.files) await writeText(path.join(repoDir(staging, repo.kind), c.dir, ...f.path.split("/")), f.content);
      }
    }
    await writeText(path.join(staging, FILES.tokensCss), tokens.css);
    await writeText(path.join(staging, FILES.tokensSimpleCss), tokens.simpleCss);
    await writeText(path.join(staging, FILES.tokensJson), JSON.stringify(tokens.json));
    await writeText(path.join(staging, FILES.components), JSON.stringify(catalog.components, null, 2));
    await writeText(path.join(staging, FILES.search), JSON.stringify(buildSearchIndex(pages)));

    const manifest: Manifest = {
      schemaVersion: SCHEMA_VERSION,
      fetchedAt,
      repos: { html: html.sha, react: react.sha },
      tokensVersion: tokens.version,
      counts: { pages: pages.length, components: catalog.components.length },
      warnings,
    };
    await writeText(path.join(staging, FILES.manifest), JSON.stringify(manifest, null, 2));

    const current = path.join(cacheDir, CURRENT);
    const old = path.join(cacheDir, `old-${stamp}`);
    let hadCurrent = true;
    try {
      await rename(current, old);
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
      hadCurrent = false;
    }
    await rename(staging, current);
    if (hadCurrent) await rm(old, { recursive: true, force: true });
    return manifest;
  } catch (e) {
    await rm(staging, { recursive: true, force: true });
    throw e;
  } finally {
    await rm(lock, { force: true });
  }
}
