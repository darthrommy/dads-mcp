import { normalizeName } from "../catalog.js";
import { githubFileUrl, REPOS } from "../repos/github.js";
import type { Manifest, RepoKind } from "../types.js";
import { UPDATE_COMMAND } from "../version.js";

export type Source =
  | { kind: "site"; title: string; url: string }
  | { kind: "github"; repo: RepoKind; dir: string; file: string; sha?: string }
  | { kind: "tokens"; version: string };

export const MAX_CHARS = 20000;
const STALE_MS = 30 * 24 * 60 * 60 * 1000;

function sourceLine(s: Source): string {
  switch (s.kind) {
    case "site":
      return `出典: 「${s.title}」（デジタル庁デザインシステム）${s.url} を dads-mcp が取得・整形`;
    case "github": {
      const url = githubFileUrl(s.repo, s.dir, s.file, s.sha);
      return `出典: digital-go-jp/${REPOS[s.repo]}（MIT License）${url}${s.sha ? ` commit ${s.sha.slice(0, 7)}` : ""}`;
    }
    case "tokens":
      return `出典: @digital-go-jp/design-tokens v${s.version}（MIT License）`;
  }
}

export function finalize(body: string, sources: Source[], manifest: Manifest, now: Date, truncHint?: string): string {
  let out = body.trimEnd();
  if (out.length > MAX_CHARS) {
    out = `${out.slice(0, MAX_CHARS)}\n\n（長いため ${MAX_CHARS} 文字で切りました。${truncHint ?? ""}）`;
  }
  if (now.getTime() - new Date(manifest.fetchedAt).getTime() > STALE_MS) {
    out += `\n\nスナップショットの取得から30日以上たっています。\`${UPDATE_COMMAND}\` で更新できます。`;
  }
  const lines = [...new Set(sources.map(sourceLine))];
  return `${out}\n\n---\n${lines.join("\n")}${lines.length ? "\n" : ""}取得日: ${manifest.fetchedAt.slice(0, 10)}\n`;
}

function distance(a: string, b: string): number {
  const dp = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = dp[j];
      dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return dp[b.length];
}

export function suggest(input: string, candidates: string[], max = 5): string[] {
  const q = normalizeName(input);
  if (!q) return [];
  const scored = [...new Set(candidates)]
    .map((c) => {
      const n = normalizeName(c);
      const d = n.includes(q) || q.includes(n) ? 0 : distance(q, n);
      return { c, d };
    })
    .filter(({ d }) => d <= Math.max(2, Math.floor(q.length / 3)))
    .sort((a, b) => a.d - b.d || a.c.localeCompare(b.c));
  return scored.slice(0, max).map(({ c }) => c);
}

export function notFound(kind: string, input: string, candidates: string[]): string {
  const list = suggest(input, candidates);
  return `${kind}「${input}」は見つかりませんでした。${list.length ? `候補: ${list.join(", ")}` : ""}`.trimEnd();
}
