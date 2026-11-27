import path from "node:path";

export type DepKind = "font" | "css" | "js";

/**
 * target は、リポジトリ内のファイルなら src/components/ からの相対パス（"button/button.css"）、
 * src/ 直下のファイルなら src/ からの相対パス（"global.css"）、外部なら URL
 */
export interface Dep {
  kind: DepKind;
  target: string;
}

export interface ParsedExample {
  file: string;
  /** <title> から「｜コンポーネント名」を除いたもの */
  title: string | undefined;
  deps: Dep[];
  /** <head> の <script> と <body> の中身 */
  snippet: string;
}

export interface CollectedDep extends Dep {
  usedBy: string[];
}

const FONT_HOST = /^https?:\/\/fonts\.(googleapis|gstatic)\.com(\/|$)/;
const TAG = /<link\b[^>]*>|<script\b[^>]*>[\s\S]*?<\/script\s*>/gi;

function attr(tag: string, name: string): string | undefined {
  const m = new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i").exec(tag);
  return m ? (m[1] ?? m[2] ?? m[3]) : undefined;
}

function resolveTarget(dir: string, href: string): string {
  if (/^([a-z][a-z0-9+.-]*:|\/\/)/i.test(href)) return href;
  const p = path.posix.normalize(path.posix.join("src/components", dir, href.split(/[?#]/)[0]));
  if (p.startsWith("src/components/")) return p.slice("src/components/".length);
  if (p.startsWith("src/")) return p.slice("src/".length);
  return p;
}

function depsOf(dir: string, html: string): Dep[] {
  const deps: Dep[] = [];
  for (const [tag] of html.matchAll(TAG)) {
    if (/^<link/i.test(tag)) {
      const href = attr(tag, "href");
      if (!href || !(attr(tag, "rel") ?? "").split(/\s+/).includes("stylesheet")) continue;
      deps.push({ kind: FONT_HOST.test(href) ? "font" : "css", target: resolveTarget(dir, href) });
    } else {
      const src = attr(tag.slice(0, tag.indexOf(">") + 1), "src");
      if (src) deps.push({ kind: "js", target: resolveTarget(dir, src) });
    }
  }
  return deps;
}

export function parseExample(dir: string, file: string, html: string): ParsedExample {
  const head = /<head\b[^>]*>([\s\S]*?)<\/head\s*>/i.exec(html)?.[1];
  const bodyMatch = /<body\b[^>]*>([\s\S]*?)<\/body\s*>/i.exec(html);
  if (head === undefined && !bodyMatch) return { file, title: undefined, deps: [], snippet: html.trim() };

  const title = /<title>([\s\S]*?)<\/title>/i.exec(head ?? "")?.[1].replace(/｜.*$/s, "").trim() || undefined;
  const body = bodyMatch
    ? bodyMatch[1]
    : html.slice(html.search(/<\/head\s*>/i)).replace(/<\/head\s*>|<\/?html\b[^>]*>/gi, "");
  const headScripts = [...(head ?? "").matchAll(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi)].map((m) => m[0]);
  const snippet = [headScripts.join("\n"), body.trim()].filter(Boolean).join("\n\n");
  return { file, title, deps: [...depsOf(dir, head ?? ""), ...depsOf(dir, body)], snippet };
}

/** フォントを読み込む <link>（preconnect を含む）を、書かれている順に返す */
export function fontLinkTags(html: string): string[] {
  const head = /<head\b[^>]*>([\s\S]*?)<\/head\s*>/i.exec(html)?.[1] ?? "";
  return [...head.matchAll(/<link\b[^>]*>/gi)].map((m) => m[0]).filter((tag) => FONT_HOST.test(attr(tag, "href") ?? ""));
}

const PREFERRED = ["playground.html", "basic.html", "example.html"];

/** 代表の作例: playground.html、basic.html、example.html、playground で始まるもの、名前順で最初のもの */
export function pickRepresentative(files: string[]): string | undefined {
  const htmls = files.filter((f) => f.endsWith(".html")).sort((a, b) => a.localeCompare(b));
  return PREFERRED.find((p) => htmls.includes(p)) ?? htmls.find((f) => f.startsWith("playground")) ?? htmls[0];
}

export function collectDeps(examples: ParsedExample[]): CollectedDep[] {
  const byTarget = new Map<string, CollectedDep>();
  for (const ex of examples) {
    for (const d of ex.deps) {
      const cur = byTarget.get(d.target) ?? { ...d, usedBy: [] };
      if (!cur.usedBy.includes(ex.file)) cur.usedBy.push(ex.file);
      byTarget.set(d.target, cur);
    }
  }
  return [...byTarget.values()];
}
