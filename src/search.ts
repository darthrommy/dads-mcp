import type { PageDoc } from "./types.js";

export interface SearchSection {
  path: string;
  url: string;
  title: string;
  heading: string;
  text: string;
}
export interface SearchIndex {
  sections: SearchSection[];
  grams: Record<string, number[]>;
}
export interface SearchHit {
  title: string;
  heading: string;
  url: string;
  snippet: string;
  score: number;
}

const norm = (s: string) => s.normalize("NFKC").toLowerCase();

function bigrams(s: string): Set<string> {
  const out = new Set<string>();
  const chars = [...s];
  for (let i = 0; i + 1 < chars.length; i++) {
    const g = chars[i] + chars[i + 1];
    if (!/\s/.test(g)) out.add(g);
  }
  return out;
}

function splitSections(page: PageDoc): SearchSection[] {
  const sections: SearchSection[] = [];
  let heading = page.title;
  let lines: string[] = [];
  const flush = () => {
    const text = lines.join("\n").trim();
    if (text || heading !== page.title) sections.push({ path: page.path, url: page.url, title: page.title, heading, text });
    lines = [];
  };
  for (const line of page.markdown.split("\n")) {
    const h = /^(#{1,3})\s+(.*)$/.exec(line);
    if (h && h[1] === "#") continue;
    if (h) {
      flush();
      heading = h[2].trim();
    } else {
      lines.push(line);
    }
  }
  flush();
  return sections;
}

const countOf = (hay: string, needle: string) => hay.split(needle).length - 1;

export function buildSearchIndex(pages: PageDoc[]): SearchIndex {
  const sections = pages.flatMap(splitSections);
  const grams: Record<string, number[]> = {};
  sections.forEach((s, i) => {
    for (const g of bigrams(norm(`${s.title}\n${s.heading}\n${s.text}`))) (grams[g] ??= []).push(i);
  });
  return { sections, grams };
}

export function searchIndex(index: SearchIndex, query: string, limit: number): SearchHit[] {
  const terms = norm(query).split(/\s+/).filter(Boolean);
  if (terms.length === 0) return [];

  let candidates: Set<number> | undefined;
  for (const term of terms) {
    for (const g of bigrams(term)) {
      const ids = new Set(Object.hasOwn(index.grams, g) ? index.grams[g] : []);
      candidates = candidates ? new Set([...candidates].filter((i) => ids.has(i))) : ids;
    }
  }
  const pool = candidates ? [...candidates] : index.sections.map((_, i) => i);

  const hits: SearchHit[] = [];
  for (const i of pool) {
    const s = index.sections[i];
    const title = norm(s.title);
    const heading = norm(s.heading);
    const text = norm(s.text);
    if (!terms.every((t) => title.includes(t) || heading.includes(t) || text.includes(t))) continue;
    let score = 0;
    for (const t of terms) {
      score += countOf(text, t);
      if (title.includes(t) || heading.includes(t)) score += 3;
    }
    hits.push({ title: s.title, heading: s.heading, url: s.url, snippet: snippet(s.text, terms), score });
  }
  hits.sort((a, b) => b.score - a.score);
  return hits.slice(0, limit);
}

function snippet(text: string, terms: string[]): string {
  const longest = [...terms].sort((a, b) => b.length - a.length)[0];
  const lower = text.normalize("NFKC").toLowerCase();
  const source = text.normalize("NFKC");
  const at = Math.max(0, lower.indexOf(longest));
  const start = Math.max(0, at - 40);
  return source.slice(start, at + longest.length + 40).replace(/\s+/g, " ").trim();
}
