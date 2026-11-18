import type { ComponentEntry, PageDoc, RepoComponent, RepoKind } from "./types.js";

export type NameOverrides = Record<string, { html?: string; react?: string }>;

const LABEL: Record<RepoKind, string> = { html: "HTML版", react: "React版" };

export function normalizeName(s: string): string {
  return s
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[-\s_]/g, "")
    .replace(/s$/, "");
}

function kebab(dir: string): string {
  return dir
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/[\s_]+/g, "-")
    .toLowerCase();
}

function summarize(markdown: string): string {
  const paragraphs = markdown.split(/\n{2,}/).map((p) => p.trim());
  const first = paragraphs.find((p) => p && !p.startsWith("#") && !p.startsWith("!["));
  if (!first) return "";
  const end = first.indexOf("。");
  const sentence = end >= 0 ? first.slice(0, end + 1) : first;
  return sentence.replace(/\s+/g, " ").slice(0, 120);
}

export function buildCatalog(
  pages: PageDoc[],
  html: RepoComponent[],
  react: RepoComponent[],
  overrides: NameOverrides,
): { components: ComponentEntry[]; warnings: string[] } {
  const warnings: string[] = [];
  const repoDirs: Record<RepoKind, string[]> = { html: html.map((c) => c.dir), react: react.map((c) => c.dir) };
  const used: Record<RepoKind, Set<string>> = { html: new Set(), react: new Set() };
  const pagePaths = new Set(pages.map((p) => p.path));
  const entries = new Map<string, ComponentEntry>();

  for (const page of pages) {
    const m = /^components\/([^/]+)$/.exec(page.path);
    if (!m) continue;
    const slug = m[1];
    const entry: ComponentEntry = {
      slug,
      nameJa: page.title.replace(/（概要）$/, "").trim(),
      summary: summarize(page.markdown),
      pages: { overview: page.path },
    };
    for (const sub of ["usage", "accessibility"] as const) {
      if (pagePaths.has(`${page.path}/${sub}`)) entry.pages[sub] = `${page.path}/${sub}`;
    }
    for (const kind of ["html", "react"] as const) {
      const candidate =
        overrides[slug]?.[kind] ??
        page.resourceLinks[kind] ??
        repoDirs[kind].find((d) => normalizeName(d) === normalizeName(slug));
      if (!candidate) continue;
      if (!repoDirs[kind].includes(candidate)) {
        warnings.push(`${LABEL[kind]} "${candidate}"（${slug} の対応先）がリポジトリにありません`);
        continue;
      }
      entry[kind === "html" ? "htmlDir" : "reactDir"] = candidate;
      used[kind].add(candidate);
    }
    entries.set(slug, entry);
  }

  for (const kind of ["html", "react"] as const) {
    for (const dir of repoDirs[kind]) {
      if (used[kind].has(dir)) continue;
      warnings.push(`${LABEL[kind]} "${dir}" に対応するガイドラインページがありません`);
      const slug = kebab(dir);
      let entry = entries.get(slug);
      if (!entry) {
        entry = { slug, nameJa: dir, summary: "（ガイドラインページなし）", pages: {} };
        entries.set(slug, entry);
      }
      const key = kind === "html" ? "htmlDir" : "reactDir";
      if (!entry[key]) entry[key] = dir;
    }
  }

  const components = [...entries.values()].sort((a, b) => a.slug.localeCompare(b.slug));
  return { components, warnings };
}
