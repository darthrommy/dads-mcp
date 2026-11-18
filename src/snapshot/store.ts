import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import type { SearchIndex } from "../search.js";
import {
  type ComponentEntry,
  type Manifest,
  type PageDoc,
  type RepoComponent,
  type RepoKind,
  type RepoSnapshot,
  SCHEMA_VERSION,
  type TokenSnapshot,
} from "../types.js";
import { CURRENT, FILES, parsePage, repoDir } from "./layout.js";

async function listFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { recursive: true, withFileTypes: true });
  return entries
    .filter((e) => e.isFile())
    .map((e) => path.relative(dir, path.join(e.parentPath ?? (e as unknown as { path: string }).path, e.name)).split(path.sep).join("/"))
    .sort();
}

async function readRepo(root: string, kind: RepoKind, sha?: string): Promise<RepoSnapshot> {
  const base = repoDir(root, kind);
  const byDir = new Map<string, RepoComponent>();
  let files: string[] = [];
  try {
    files = await listFiles(base);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
  }
  for (const rel of files) {
    const [dir, ...rest] = rel.split("/");
    if (!byDir.has(dir)) byDir.set(dir, { dir, files: [] });
    byDir.get(dir)!.files.push({ path: rest.join("/"), content: await readFile(path.join(base, rel), "utf8") });
  }
  return { kind, sha, components: [...byDir.values()] };
}

export class SnapshotStore {
  private readonly pages: Map<string, PageDoc>;

  private constructor(
    readonly manifest: Manifest,
    readonly components: ComponentEntry[],
    readonly tokens: TokenSnapshot,
    readonly search: SearchIndex,
    readonly repos: Record<RepoKind, RepoSnapshot>,
    pages: PageDoc[],
  ) {
    this.pages = new Map(pages.map((p) => [p.path, p]));
  }

  static async open(cacheDir: string): Promise<SnapshotStore | null> {
    const root = path.join(cacheDir, CURRENT);
    const read = (f: string) => readFile(path.join(root, f), "utf8");
    let manifest: Manifest;
    try {
      manifest = JSON.parse(await read(FILES.manifest)) as Manifest;
      if (typeof manifest !== "object" || manifest === null) throw new Error("manifest.json がオブジェクトではありません");
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT") return null;
      console.error(`[dads-mcp] スナップショットの manifest を読めません: ${(e as Error).message}`);
      return null;
    }
    if (manifest.schemaVersion !== SCHEMA_VERSION) {
      console.error(`[dads-mcp] スナップショットの形式が古いため取り直します（schemaVersion ${manifest.schemaVersion}）`);
      return null;
    }
    try {
      const components = JSON.parse(await read(FILES.components)) as ComponentEntry[];
      if (!Array.isArray(components)) throw new Error("components.json が配列ではありません");
      const search = JSON.parse(await read(FILES.search)) as SearchIndex;
      const tokens: TokenSnapshot = {
        version: manifest.tokensVersion,
        css: await read(FILES.tokensCss),
        simpleCss: await read(FILES.tokensSimpleCss),
        json: JSON.parse(await read(FILES.tokensJson)) as Record<string, unknown>,
      };
      const pagesRoot = path.join(root, "pages");
      const pages: PageDoc[] = [];
      for (const rel of await listFiles(pagesRoot)) {
        if (!rel.endsWith(".md")) continue;
        const p = rel.slice(0, -3);
        pages.push(parsePage(await readFile(path.join(pagesRoot, rel), "utf8"), p));
      }
      const repos = {
        html: await readRepo(root, "html", manifest.repos.html),
        react: await readRepo(root, "react", manifest.repos.react),
      };
      return new SnapshotStore(manifest, components, tokens, search, repos, pages);
    } catch (e) {
      console.error(`[dads-mcp] スナップショットが壊れているため取り直します: ${(e as Error).message}`);
      return null;
    }
  }

  getPage(p: string): PageDoc | undefined {
    return this.pages.get(p);
  }

  listPages(prefix: string): PageDoc[] {
    return [...this.pages.values()].filter((p) => p.path.startsWith(prefix)).sort((a, b) => a.path.localeCompare(b.path));
  }

  allPaths(): string[] {
    return [...this.pages.keys()].sort();
  }
}
