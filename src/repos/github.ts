import type { Http } from "../http.js";
import { readTarFiles } from "../tarball.js";
import type { RepoComponent, RepoKind, RepoSnapshot } from "../types.js";

export const REPOS: Record<RepoKind, string> = {
  html: "design-system-example-components-html",
  react: "design-system-example-components-react",
};

const OWNER = "digital-go-jp";
const INCLUDE = /\.(md|html|css|ts|tsx)$/;
const EXCLUDE: Record<RepoKind, RegExp> = {
  html: /(\.stories\.ts|\.vrt\.js|\.mdx)$/,
  react: /(\.stories\.tsx|\.mdx)$/,
};
const COMPONENT_PATH = /^[^/]+\/src\/components\/([^/]+)\/(.+)$/;

export function tarballUrl(kind: RepoKind): string {
  return `https://codeload.github.com/${OWNER}/${REPOS[kind]}/tar.gz/refs/heads/main`;
}

export function githubFileUrl(kind: RepoKind, dir: string, file: string, sha?: string): string {
  return `https://github.com/${OWNER}/${REPOS[kind]}/blob/${sha ?? "main"}/src/components/${dir}/${file}`;
}

export async function extractComponents(tgz: Buffer, kind: RepoKind): Promise<RepoComponent[]> {
  const files = await readTarFiles(tgz, (p) => {
    const m = COMPONENT_PATH.exec(p);
    return !!m && INCLUDE.test(m[2]) && !EXCLUDE[kind].test(m[2]);
  });
  const byDir = new Map<string, RepoComponent>();
  for (const [p, content] of files) {
    const [, dir, rel] = COMPONENT_PATH.exec(p)!;
    if (!byDir.has(dir)) byDir.set(dir, { dir, files: [] });
    byDir.get(dir)!.files.push({ path: rel, content });
  }
  const comps = [...byDir.values()].sort((a, b) => a.dir.localeCompare(b.dir));
  for (const c of comps) c.files.sort((a, b) => a.path.localeCompare(b.path));
  return comps;
}

export async function fetchRepo(http: Http, kind: RepoKind): Promise<RepoSnapshot> {
  const components = await extractComponents(await http.buffer(tarballUrl(kind)), kind);
  let sha: string | undefined;
  try {
    const res = await http.json<{ sha?: string }>(`https://api.github.com/repos/${OWNER}/${REPOS[kind]}/commits/main`, {
      Accept: "application/vnd.github+json",
    });
    sha = typeof res.sha === "string" ? res.sha : undefined;
  } catch {
    sha = undefined;
  }
  return { kind, sha, components };
}
