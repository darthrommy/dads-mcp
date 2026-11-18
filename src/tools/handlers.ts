import { normalizeName } from "../catalog.js";
import { searchIndex } from "../search.js";
import { SITE_BASE, urlToPath } from "../site/sitemap.js";
import type { SnapshotStore } from "../snapshot/store.js";
import { selectTokens, TOKEN_CATEGORIES, type TokenCategory, tokenUsage } from "../tokens/select.js";
import type { ComponentEntry, PageDoc, RepoKind } from "../types.js";
import { finalize, notFound, type Source } from "./format.js";

export const COMPONENT_PARTS = ["overview", "usage", "accessibility", "html", "css", "react"] as const;
export type ComponentPart = (typeof COMPONENT_PARTS)[number];
const DEFAULT_PARTS: ComponentPart[] = ["overview", "usage", "accessibility", "html"];
const PART_LABEL: Record<ComponentPart, string> = {
  overview: "概要",
  usage: "使い方",
  accessibility: "アクセシビリティ",
  html: "HTML",
  css: "CSS",
  react: "React",
};
const REACT_NOTE = "React 版は Tailwind CSS と `@digital-go-jp/tailwind-theme-plugin` が前提です。";

const siteSource = (p: PageDoc): Source => ({ kind: "site", title: p.title, url: p.url });
const stripTitle = (md: string) => md.replace(/^# .*\n+/, "").trim();
const fence = (lang: string, code: string) => `\`\`\`${lang}\n${code.trimEnd()}\n\`\`\``;

function topSource(s: SnapshotStore): Source {
  const top = s.getPage("index");
  return { kind: "site", title: top?.title ?? "デジタル庁デザインシステムβ版", url: SITE_BASE };
}

function findComponent(s: SnapshotStore, name: string): ComponentEntry | undefined {
  const q = normalizeName(name.replace(/（概要）\s*$/, ""));
  return s.components.find((c) =>
    [c.slug, c.nameJa, c.htmlDir, c.reactDir].some((v) => v !== undefined && normalizeName(v) === q),
  );
}

export function listComponents(s: SnapshotStore, _a: Record<string, never>, now: Date): string {
  const mark = (b: boolean) => (b ? "○" : "−");
  const rows = s.components.map(
    (c) => `| ${c.slug} | ${c.nameJa} | ${c.summary} | ${mark(!!c.pages.overview)} | ${mark(!!c.htmlDir)} | ${mark(!!c.reactDir)} |`,
  );
  const body = [
    `# コンポーネント一覧（${s.components.length} 件）`,
    "",
    "| slug | 名前 | 概要 | ガイドライン | HTML | React |",
    "| --- | --- | --- | --- | --- | --- |",
    ...rows,
  ].join("\n");
  return finalize(body, [topSource(s)], s.manifest, now);
}

function repoFiles(s: SnapshotStore, kind: RepoKind, dir: string | undefined, accept: (path: string) => boolean) {
  const comp = dir ? s.repos[kind].components.find((c) => c.dir === dir) : undefined;
  return (comp?.files ?? []).filter((f) => accept(f.path)).map((f) => ({ ...f, dir: dir! }));
}

export function getComponent(s: SnapshotStore, a: { name: string; parts?: ComponentPart[] }, now: Date): string {
  const c = findComponent(s, a.name);
  if (!c) {
    const cands = s.components.flatMap((x) => [x.slug, x.nameJa]);
    return finalize(notFound("コンポーネント", a.name, cands), [topSource(s)], s.manifest, now);
  }
  const parts = a.parts?.length ? a.parts : DEFAULT_PARTS;
  const sources: Source[] = [];
  const out: string[] = [`# ${c.nameJa}（${c.slug}）`, "", c.summary];

  for (const part of parts) {
    out.push("", `## ${PART_LABEL[part]}`, "");
    let section: string[] = [];
    if (part === "overview" || part === "usage" || part === "accessibility") {
      const p = c.pages[part] ? s.getPage(c.pages[part]!) : undefined;
      if (p) {
        section.push(stripTitle(p.markdown));
        sources.push(siteSource(p));
      }
    } else {
      const kind: RepoKind = part === "react" ? "react" : "html";
      const dir = kind === "react" ? c.reactDir : c.htmlDir;
      const accept =
        part === "html"
          ? (f: string) => f.endsWith(".md") || f.endsWith(".html")
          : part === "css"
            ? (f: string) => f.endsWith(".css")
            : (f: string) => /\.(tsx|ts|md)$/.test(f);
      const files = repoFiles(s, kind, dir, accept);
      if (files.length && part === "react") section.push(REACT_NOTE, "");
      for (const f of files) {
        const lang = f.path.endsWith(".md") ? "" : f.path.split(".").pop()!;
        section.push(`### ${f.path}`, "", lang ? fence(lang === "ts" ? "tsx" : lang, f.content) : f.content.trim(), "");
        sources.push({ kind: "github", repo: kind, dir: f.dir, file: f.path, sha: s.repos[kind].sha });
      }
    }
    if (section.length === 0) section = [`（${part} はありません）`];
    out.push(section.join("\n").trimEnd());
  }
  return finalize(out.join("\n"), sources, s.manifest, now, "`parts` を絞って再実行してください。");
}

function foundationTopics(s: SnapshotStore): Map<string, PageDoc[]> {
  const topics = new Map<string, PageDoc[]>();
  for (const p of s.listPages("foundations/")) {
    const [, topic] = p.path.split("/");
    if (!topics.has(topic)) topics.set(topic, []);
    topics.get(topic)!.push(p);
  }
  return topics;
}

export function listFoundations(s: SnapshotStore, _a: Record<string, never>, now: Date): string {
  const lines = ["# 基本ルール（foundations）一覧", ""];
  for (const [topic, pages] of foundationTopics(s)) {
    const main = pages.find((p) => p.path === `foundations/${topic}`);
    const subs = pages.filter((p) => p !== main).map((p) => p.path.split("/").slice(2).join("/"));
    lines.push(`- ${topic}: ${main?.title ?? topic}${subs.length ? `（サブページ: ${subs.join(", ")}）` : ""}`);
  }
  return finalize(lines.join("\n"), [topSource(s)], s.manifest, now);
}

export function getFoundation(s: SnapshotStore, a: { topic: string; subpage?: string }, now: Date): string {
  const topic = a.topic.trim().toLowerCase();
  const sub = a.subpage?.trim().toLowerCase().replace(/^\/+|\/+$/g, "");
  const p = s.getPage(sub ? `foundations/${topic}/${sub}` : `foundations/${topic}`);
  if (!p) {
    const topics = foundationTopics(s);
    const cands = sub && topics.has(topic)
      ? topics.get(topic)!.map((x) => x.path.split("/").slice(2).join("/")).filter(Boolean)
      : [...topics.keys()];
    return finalize(notFound("基本ルール", sub ? `${topic}/${sub}` : topic, cands), [topSource(s)], s.manifest, now);
  }
  return finalize(p.markdown, [siteSource(p)], s.manifest, now);
}

export function getTokens(s: SnapshotStore, a: { category?: string; format?: "css" | "json" }, now: Date): string {
  const tokenSrc: Source = { kind: "tokens", version: s.tokens.version };
  const category = a.category?.trim().toLowerCase() || undefined;
  if (category === "spacing") {
    return finalize(
      "余白（spacing）のトークンはありません。`get_foundation` で topic `spacing` を参照してください。",
      [tokenSrc],
      s.manifest,
      now,
    );
  }
  if (category && !TOKEN_CATEGORIES.includes(category as TokenCategory)) {
    return finalize(notFound("トークンのカテゴリ", category, TOKEN_CATEGORIES), [tokenSrc], s.manifest, now);
  }
  const format = a.format ?? "css";
  const body = [
    `# デザイントークン（${category ?? "すべて"}）`,
    "",
    fence(format, selectTokens(s.tokens, category as TokenCategory | undefined, format)),
    "",
    tokenUsage(s.tokens.version),
  ].join("\n");
  return finalize(body, [tokenSrc], s.manifest, now);
}

export function search(s: SnapshotStore, a: { query: string; limit?: number }, now: Date): string {
  const limit = Math.min(Math.max(a.limit ?? 10, 1), 50);
  const hits = searchIndex(s.search, a.query, limit);
  if (hits.length === 0) {
    return finalize(`「${a.query}」に一致するページはありませんでした。`, [topSource(s)], s.manifest, now);
  }
  const lines = [`# 「${a.query}」の検索結果（${hits.length} 件）`, ""];
  for (const h of hits) lines.push(`- [${h.title} / ${h.heading}](${h.url})`, `  ${h.snippet}`);
  const sources = hits.map((h): Source => ({ kind: "site", title: h.title, url: h.url }));
  return finalize(lines.join("\n"), sources, s.manifest, now);
}

export function getPage(s: SnapshotStore, a: { path: string }, now: Date): string {
  const raw = a.path.trim();
  const p = /^https?:\/\//.test(raw)
    ? urlToPath(raw)
    : raw.replace(/^\/+|\/+$/g, "").replace(/^dads(\/|$)/, "") || "index";
  const page = s.getPage(p);
  if (!page) return finalize(notFound("ページ", p, s.allPaths()), [topSource(s)], s.manifest, now);
  return finalize(page.markdown, [siteSource(page)], s.manifest, now);
}
