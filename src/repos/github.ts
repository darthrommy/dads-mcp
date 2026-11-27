import type { Http } from "../http.js";
import { readTarFiles } from "../tarball.js";
import type { ComponentFile, RepoComponent, RepoKind, RepoSnapshot } from "../types.js";

export const REPOS: Record<RepoKind, string> = {
  html: "design-system-example-components-html",
  react: "design-system-example-components-react",
};

const OWNER = "digital-go-jp";
const INCLUDE: Record<RepoKind, RegExp> = {
  html: /\.(md|html|css|js|ts|tsx)$/,
  react: /\.(md|html|css|ts|tsx)$/,
};
const EXCLUDE: Record<RepoKind, RegExp> = {
  html: /(\.stories\.ts|\.(vrt|test|unit)\.js|\.mdx)$/,
  react: /\.mdx$/,
};
/** src/components の外から取り込むファイル（src/ からの相対パス） */
const SHARED: Record<RepoKind, string[]> = {
  html: ["global.css"],
  react: [],
};
const COMPONENT_PATH = /^[^/]+\/src\/components\/([^/]+)\/(.+)$/;
const SRC_PATH = /^[^/]+\/src\/(.+)$/;

export function tarballUrl(kind: RepoKind): string {
  return `https://codeload.github.com/${OWNER}/${REPOS[kind]}/tar.gz/refs/heads/main`;
}

/** repoPath はリポジトリのルートからの相対パス（"src/global.css" など） */
export function githubPathUrl(kind: RepoKind, repoPath: string, sha?: string): string {
  return `https://github.com/${OWNER}/${REPOS[kind]}/blob/${sha ?? "main"}/${repoPath}`;
}

export function githubFileUrl(kind: RepoKind, dir: string, file: string, sha?: string): string {
  return githubPathUrl(kind, `src/components/${dir}/${file}`, sha);
}

export async function extractRepo(tgz: Buffer, kind: RepoKind): Promise<{ components: RepoComponent[]; shared: ComponentFile[] }> {
  const isShared = (p: string) => {
    const m = SRC_PATH.exec(p);
    return !!m && SHARED[kind].includes(m[1]);
  };
  const files = await readTarFiles(tgz, (p) => {
    if (isShared(p)) return true;
    const m = COMPONENT_PATH.exec(p);
    return !!m && INCLUDE[kind].test(m[2]) && !EXCLUDE[kind].test(m[2]);
  });
  const byDir = new Map<string, RepoComponent>();
  const shared: ComponentFile[] = [];
  for (const [p, content] of files) {
    if (isShared(p)) {
      shared.push({ path: SRC_PATH.exec(p)![1], content });
      continue;
    }
    const [, dir, rel] = COMPONENT_PATH.exec(p)!;
    if (!byDir.has(dir)) byDir.set(dir, { dir, files: [] });
    byDir.get(dir)!.files.push({ path: rel, content });
  }
  const components = [...byDir.values()].sort((a, b) => a.dir.localeCompare(b.dir));
  for (const c of components) c.files.sort((a, b) => a.path.localeCompare(b.path));
  shared.sort((a, b) => a.path.localeCompare(b.path));
  return { components, shared };
}

export async function fetchRepo(http: Http, kind: RepoKind): Promise<RepoSnapshot> {
  const { components, shared } = await extractRepo(await http.buffer(tarballUrl(kind)), kind);
  let sha: string | undefined;
  try {
    const res = await http.json<{ sha?: string }>(`https://api.github.com/repos/${OWNER}/${REPOS[kind]}/commits/main`, {
      Accept: "application/vnd.github+json",
    });
    sha = typeof res.sha === "string" ? res.sha : undefined;
  } catch {
    sha = undefined;
  }
  return { kind, sha, components, shared };
}

/** 共通ファイルが上流で見つからなかったときの警告 */
export function missingSharedWarnings(repo: RepoSnapshot): string[] {
  const have = new Set(repo.shared.map((f) => f.path));
  return SHARED[repo.kind].filter((p) => !have.has(p)).map((p) => `${REPOS[repo.kind]} の src/${p} が見つかりません`);
}
