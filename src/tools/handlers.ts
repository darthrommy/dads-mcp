import path from "node:path";
import { normalizeName } from "../catalog.js";
import { type CollectedDep, collectDeps, fontLinkTags, type ParsedExample, parseExample, pickRepresentative } from "../examples.js";
import { analyzeGlobalCss, familyList, type GlobalCssAnalysis } from "../globalcss.js";
import { type SearchKind, searchIndex } from "../search.js";
import { SITE_BASE, urlToPath } from "../site/sitemap.js";
import { pageFile } from "../snapshot/layout.js";
import type { SnapshotStore } from "../snapshot/store.js";
import { extractSpec, formatSpec } from "../spec.js";
import { selectTokens, TOKEN_CATEGORIES, type TokenCategory, tokenUsage } from "../tokens/select.js";
import type { ComponentEntry, ComponentFile, PageDoc, RepoKind } from "../types.js";
import { UPDATE_COMMAND } from "../version.js";
import { finalize, MAX_CHARS, notFound, type Source, suggest } from "./format.js";

export const COMPONENT_PARTS = ["overview", "usage", "accessibility", "html", "css", "js", "react", "spec"] as const;
export type ComponentPart = (typeof COMPONENT_PARTS)[number];
const DEFAULT_PARTS: ComponentPart[] = ["overview", "usage", "accessibility", "html"];
const PART_LABEL: Record<ComponentPart, string> = {
  overview: "概要",
  usage: "使い方",
  accessibility: "アクセシビリティ",
  html: "HTML",
  css: "CSS",
  js: "JavaScript",
  react: "React",
  spec: "属性とクラス（CSS から抽出）",
};
const REACT_NOTE = "React 版は Tailwind CSS と `@digital-go-jp/tailwind-theme-plugin` が前提です。";
const STORIES_NOTE =
  "React 版には、このコンポーネントの共通部品（.tsx）がありません。Storybook の作例（*.stories.tsx）を載せます。";
const EXAMPLE_NOTE =
  "作例は `<body>` の中身と `<head>` の `<script>` だけを載せています。`<head>` で読み込むファイルは「読み込むファイル」にまとめています。";
/** 省いたものの一覧などのために残しておく文字数 */
const RESERVE = 2500;
const BUDGET = MAX_CHARS - RESERVE;

const siteSource = (p: PageDoc): Source => ({ kind: "site", title: p.title, url: p.url });
const stripTitle = (md: string) => md.replace(/^# .*\n+/, "").trim();
const fence = (lang: string, code: string) => `\`\`\`${lang}\n${code.trimEnd()}\n\`\`\``;
const quote = (v: string) => JSON.stringify(v);

function topSource(s: SnapshotStore): Source {
  const top = s.getPage("index");
  return { kind: "site", title: top?.title ?? "デジタル庁デザインシステムβ版", url: SITE_BASE };
}

function fileSource(s: SnapshotStore, kind: RepoKind, dir: string, file: string): Source {
  return { kind: "github", repo: kind, path: `src/components/${dir}/${file}`, sha: s.repos[kind].sha };
}

function findComponent(s: SnapshotStore, name: string): ComponentEntry | undefined {
  const q = normalizeName(name.replace(/（概要）\s*$/, ""));
  const exact = s.components.find((c) =>
    [c.slug, c.nameJa, c.htmlDir, c.reactDir].some((v) => v !== undefined && normalizeName(v) === q),
  );
  if (exact) return exact;
  const byPart = s.components.filter((c) => c.nameJa.split(/[／/]/).some((p) => normalizeName(p) === q));
  return byPart.length === 1 ? byPart[0] : undefined;
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

// ---- 文字数の上限に合わせて組み立てる ----

type Item = { kind: "fixed"; text: string } | Content;
interface Content {
  kind: "content";
  heading?: string;
  /** 空ならコードブロックにしない */
  lang: string;
  body: string;
  sources: Source[];
  /** 省いたときの一覧に出す名前 */
  label: string;
  /** これだけを取る呼び出し方 */
  hint: string;
  /** キャッシュ内のファイル */
  local?: string;
  /** body の 1 行目が元の何行目か（from_line で途中から返すとき） */
  firstLine?: number;
  /** 元の行数 */
  totalLines?: number;
  /** n 行目からの続きを取る呼び出し方 */
  more?: (n: number) => string;
}

const fixed = (text: string): Item => ({ kind: "fixed", text });
const OMITTED_NOTE = "（文字数の上限のため省きました。末尾の「省いた内容」を参照してください）";

function render(c: Content, body = c.body): string {
  return [c.heading, c.lang ? fence(c.lang, body) : body.trim()].filter(Boolean).join("\n\n");
}

/** 行の境目で room 文字に収まるように切る。1 行も入らなければ undefined */
function cutToFit(c: Content, room: number): string | undefined {
  const lines = c.body.split("\n");
  const from = c.firstLine ?? 1;
  const total = c.totalLines ?? lines.length + from - 1;
  const note = (k: number) => {
    const last = from + k - 1;
    return (
      `（文字数の上限のため、全 ${total} 行のうち ${from === 1 ? "" : `${from} 行目から`}${last} 行目までです。` +
      (c.more ? `続きは \`${c.more(last + 1)}\` で取れます。` : "") +
      (c.local ? `全体はキャッシュの ${c.local} にあります。` : "") +
      "）"
    );
  };
  let size = render(c, "").length + 2 + note(lines.length).length;
  let k = 0;
  while (k < lines.length && size + lines[k].length + 1 <= room) size += lines[k++].length + 1;
  if (k === 0) return undefined;
  return `${render(c, lines.slice(0, k).join("\n"))}\n\n${note(k)}`;
}

function assemble(items: Item[]): { body: string; sources: Source[] } {
  const out: string[] = [];
  const sources: Source[] = [];
  const omitted: Content[] = [];
  let used = items.reduce((n, it) => n + (it.kind === "fixed" ? it.text.length + 2 : 0), 0);
  let included = false;
  for (const it of items) {
    if (it.kind === "fixed") {
      out.push(it.text);
      continue;
    }
    const text = render(it);
    const cut = included || used + text.length + 2 <= BUDGET ? undefined : cutToFit(it, BUDGET - used - 2);
    if (used + text.length + 2 <= BUDGET || cut) {
      const t = cut ?? text;
      out.push(t);
      used += t.length + 2;
      sources.push(...it.sources);
      included = true;
      continue;
    }
    // 見出しのないもの（ガイドラインの本文）は、節が空にならないように省いたことを書く
    if (!it.heading) {
      out.push(OMITTED_NOTE);
      used += OMITTED_NOTE.length + 2;
    }
    omitted.push(it);
  }
  if (omitted.length) {
    const dirs = [...new Set(omitted.flatMap((o) => (o.local ? [path.dirname(o.local)] : [])))];
    out.push(
      [
        "## 省いた内容",
        "",
        `文字数の上限（${MAX_CHARS} 文字）に収まらないため、次のものを省きました。それぞれ次の呼び出しで取れます。`,
        "",
        ...omitted.map((o) => `- ${o.label}: \`${o.hint}\``),
        ...(dirs.length ? ["", `キャッシュ内の場所: ${dirs.join("、")}`] : []),
      ].join("\n"),
    );
  }
  return { body: out.join("\n\n"), sources };
}

// ---- get_component ----

function repoFiles(s: SnapshotStore, kind: RepoKind, dir: string | undefined): ComponentFile[] {
  return (dir ? s.repos[kind].components.find((c) => c.dir === dir)?.files : undefined) ?? [];
}

function langOf(file: string): string {
  if (file.endsWith(".md")) return "";
  const ext = file.split(".").pop()!;
  return ext === "ts" ? "tsx" : ext;
}

function notFoundIn(kind: string, input: string, names: string[]): string {
  const close = suggest(input, names);
  return `${kind}「${input}」は見つかりませんでした。${close.length ? `候補: ${close.join(", ")}` : `このコンポーネントの${kind}: ${names.join(", ")}`}`;
}

function formatDeps(s: SnapshotStore, c: ComponentEntry, deps: CollectedDep[], total: number): string {
  const lines = ["## 読み込むファイル", "", "HTML 版の作例が読み込むファイルです。上から順に読み込みます。", ""];
  for (const d of deps) {
    let line: string;
    if (d.kind === "font") line = `- フォント: ${d.target}`;
    else if (/^([a-z][a-z0-9+.-]*:|\/\/)/i.test(d.target)) line = `- ${d.target}（外部の${d.kind === "css" ? "スタイルシート" : "スクリプト"}）`;
    else if (!d.target.includes("/")) {
      line =
        d.target === "global.css"
          ? "- global.css: 共通の土台。tokens.css の後に読み込みます（`get_setup` で取得）"
          : `- ${d.target}`;
    } else {
      const [dir, ...rest] = d.target.split("/");
      const part = d.kind === "css" ? "css" : "js";
      const what = d.kind === "css" ? "CSS" : "JavaScript";
      if (dir === c.htmlDir) line = `- ${rest.join("/")}: このコンポーネントの ${what}（\`parts: ["${part}"]\`）`;
      else {
        const owner = s.components.find((x) => x.htmlDir === dir);
        line = `- ${d.target}: ${owner ? `\`get_component(${quote(owner.slug)}, parts: ["${part}"])\`` : "（スナップショットにありません）"}`;
      }
    }
    if (d.usedBy.length < total) {
      const names = d.usedBy.slice(0, 3).join(", ");
      line += `（使う作例: ${names}${d.usedBy.length > 3 ? ` ほか ${d.usedBy.length - 3} 件` : ""}）`;
    }
    lines.push(line);
  }
  return lines.join("\n");
}

const exampleName = (file: string) => file.replace(/\.html$/, "");

const CALL_GUIDE = [
  "## ほかの取り方",
  "",
  '- `parts: ["css"]`、`parts: ["js"]`、`parts: ["react"]`: HTML 版の CSS・JavaScript、React 版のコード',
  '- `parts: ["spec"]`: CSS から抜き出した data-* 属性の値とクラスの一覧',
  '- `example: "名前"`: HTML 版の作例 1 つ（`"all"` ですべて）',
  '- `file: "ファイル名"`: ファイル 1 つ。長くて切れたときは `from_line` で続きから取れます',
].join("\n");

/** from_line 行目からにする。範囲外なら理由の文を返す */
function fromLine(c: Content, n: number | undefined): Content | string {
  if (n === undefined || n === 1) return c;
  const lines = c.body.split("\n");
  if (!Number.isInteger(n) || n < 1 || n > lines.length) return `${n} 行目はありません（全 ${lines.length} 行）。`;
  return {
    ...c,
    heading: `${c.heading ?? ""}（${n} 行目から）`,
    body: lines.slice(n - 1).join("\n"),
    firstLine: n,
    totalLines: lines.length,
  };
}

export function getComponent(
  s: SnapshotStore,
  a: { name: string; parts?: ComponentPart[]; example?: string; file?: string; from_line?: number },
  now: Date,
): string {
  const c = findComponent(s, a.name);
  if (!c) {
    const cands = s.components.flatMap((x) => [x.slug, x.nameJa, ...x.nameJa.split(/[／/]/)]);
    return finalize(notFound("コンポーネント", a.name, cands), [topSource(s)], s.manifest, now);
  }
  const header = fixed([`# ${c.nameJa}（${c.slug}）`, "", c.summary].join("\n").trimEnd());
  const htmlFiles = repoFiles(s, "html", c.htmlDir);
  const reactFiles = repoFiles(s, "react", c.reactDir);
  const fileContent = (kind: RepoKind, dir: string, f: ComponentFile, heading: string, lang = langOf(f.path)): Content => ({
    kind: "content",
    heading,
    lang,
    body: f.content,
    sources: [fileSource(s, kind, dir, f.path)],
    label: kind === "react" ? `React 版 ${f.path}` : f.path,
    hint: `get_component(${quote(c.slug)}, file: ${quote(f.path)})`,
    local: s.localPath(kind, dir, f.path),
    more: (n) => `get_component(${quote(c.slug)}, file: ${quote(f.path)}, from_line: ${n})`,
  });
  const done = (items: Item[]) => {
    const { body, sources } = assemble(items);
    return finalize(body, sources, s.manifest, now, "`parts` を絞って再実行してください。");
  };

  const fail = (msg: string) => finalize(msg, [topSource(s)], s.manifest, now);
  const single = !!a.example?.trim() && a.example.trim() !== "all";
  if (a.from_line !== undefined && !a.file && !single) return fail("`from_line` は `file` か、`example`（all 以外）と一緒に指定してください。");

  if (a.file) {
    const want = a.file.trim();
    const html = htmlFiles.find((f) => f.path === want);
    const react = html ? undefined : reactFiles.find((f) => f.path === want);
    if (!html && !react) {
      const names = [...htmlFiles, ...reactFiles].map((f) => f.path);
      return finalize(notFoundIn("ファイル", want, names), [topSource(s)], s.manifest, now);
    }
    const kind: RepoKind = html ? "html" : "react";
    const dir = (html ? c.htmlDir : c.reactDir)!;
    const item = fromLine(fileContent(kind, dir, (html ?? react)!, `## ${kind === "html" ? "HTML 版" : "React 版"} ${want}`), a.from_line);
    if (typeof item === "string") return fail(item);
    return done([header, item]);
  }

  const parsed = htmlFiles.filter((f) => f.path.endsWith(".html")).map((f) => parseExample(c.htmlDir!, f.path, f.content));
  const byFile = new Map(parsed.map((p) => [p.file, p]));
  const repFile = pickRepresentative(parsed.map((p) => p.file));
  const rep = repFile ? byFile.get(repFile) : undefined;
  const ex = a.example?.trim();
  let selected: ParsedExample[] = rep ? [rep] : [];
  if (ex) {
    if (!c.htmlDir) return finalize(`${c.nameJa}（${c.slug}）には HTML 版がありません。`, [topSource(s)], s.manifest, now);
    if (ex === "all") selected = rep ? [rep, ...parsed.filter((p) => p !== rep)] : parsed;
    else {
      const hit = byFile.get(ex.endsWith(".html") ? ex : `${ex}.html`);
      if (!hit) return finalize(notFoundIn("作例", ex, parsed.map((p) => exampleName(p.file))), [topSource(s)], s.manifest, now);
      selected = [hit];
    }
  }
  const parts: ComponentPart[] = a.parts?.length ? [...new Set(a.parts)] : ex ? ["html"] : DEFAULT_PARTS;
  if (ex && !parts.includes("html")) parts.push("html");

  const items: Item[] = [header];
  const depsFrom = single ? selected : parsed;
  const deps = collectDeps(depsFrom);
  if (deps.length) items.push(fixed(formatDeps(s, c, deps, depsFrom.length)));

  for (const part of parts) {
    items.push(fixed(`## ${PART_LABEL[part]}`));
    const before = items.length;
    if (part === "overview" || part === "usage" || part === "accessibility") {
      const p = c.pages[part] ? s.getPage(c.pages[part]!) : undefined;
      if (p) {
        items.push({
          kind: "content",
          lang: "",
          body: stripTitle(p.markdown),
          sources: [siteSource(p)],
          label: `${PART_LABEL[part]}（ガイドライン）`,
          hint: `get_component(${quote(c.slug)}, parts: ["${part}"])`,
          local: pageFile(s.root, p.path),
        });
      }
    } else if (part === "html" && c.htmlDir) {
      const dir = c.htmlDir;
      if (!single) for (const f of htmlFiles.filter((f) => f.path.endsWith(".md"))) items.push(fileContent("html", dir, f, `### ${f.path}`));
      if (selected.length) items.push(fixed(EXAMPLE_NOTE));
      for (const e of selected) {
        const name = quote(exampleName(e.file));
        const item = fromLine(
          {
            kind: "content",
            heading: `### ${e.file}${e.title ? `: ${e.title}` : ""}`,
            lang: "html",
            body: e.snippet,
            sources: [fileSource(s, "html", dir, e.file)],
            label: e.file,
            hint: `get_component(${quote(c.slug)}, parts: ["html"], example: ${name})`,
            local: s.localPath("html", dir, e.file),
            more: (n) => `get_component(${quote(c.slug)}, example: ${name}, from_line: ${n})`,
          },
          single ? a.from_line : undefined,
        );
        if (typeof item === "string") return fail(item);
        items.push(item);
      }
      const others = ex ? [] : parsed.filter((p) => p !== rep);
      if (others.length) {
        items.push(
          fixed(
            [
              "### ほかの作例",
              "",
              "`example` に名前を指定すると、その作例を取れます。`example: \"all\"` ですべてを返します。",
              "",
              ...others.map((p) => `- ${p.file}${p.title ? `: ${p.title}` : ""}（\`example: ${quote(exampleName(p.file))}\`）`),
            ].join("\n"),
          ),
        );
      }
    } else if ((part === "css" || part === "js") && c.htmlDir) {
      for (const f of htmlFiles.filter((f) => f.path.endsWith(`.${part}`))) items.push(fileContent("html", c.htmlDir, f, `### ${f.path}`));
    } else if (part === "spec" && c.htmlDir) {
      const css = htmlFiles.filter((f) => f.path.endsWith(".css"));
      if (css.length) {
        items.push({
          kind: "content",
          lang: "",
          body: formatSpec(extractSpec(css.map((f) => f.content))),
          sources: css.map((f) => fileSource(s, "html", c.htmlDir!, f.path)),
          label: PART_LABEL.spec,
          hint: `get_component(${quote(c.slug)}, parts: ["spec"])`,
        });
      }
    } else if (part === "react" && c.reactDir) {
      const code = reactFiles.filter((f) => /\.(tsx|ts|md)$/.test(f.path) && !/^export\s*\{\s*\};?$/.test(f.content.trim()));
      const hasComponent = code.some((f) => f.path.endsWith(".tsx") && !f.path.endsWith(".stories.tsx"));
      const files = hasComponent ? code.filter((f) => !f.path.endsWith(".stories.tsx")) : code;
      if (files.length) items.push(fixed(hasComponent ? REACT_NOTE : `${REACT_NOTE}\n\n${STORIES_NOTE}`));
      for (const f of files) items.push(fileContent("react", c.reactDir, f, `### ${f.path}`));
    }
    if (items.length === before) items.push(fixed(`（${part} はありません）`));
  }
  if (!a.parts?.length && !ex) items.push(fixed(CALL_GUIDE));
  return done(items);
}

// ---- foundations ----

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

// ---- tokens と共通の土台 ----

function globalCss(s: SnapshotStore): { file: ComponentFile; analysis: GlobalCssAnalysis; source: Source } | undefined {
  const file = s.repos.html.shared.find((f) => f.path === "global.css");
  if (!file) return undefined;
  return {
    file,
    analysis: analyzeGlobalCss(file.content, s.tokens.css),
    source: { kind: "github", repo: "html", path: "src/global.css", sha: s.repos.html.sha },
  };
}

const tokensLink = (version: string) =>
  `<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@digital-go-jp/design-tokens@${version}/dist/tokens.css">`;

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
  ];
  const g = globalCss(s);
  if (g) {
    body.push(
      "",
      "### global.css との関係",
      "",
      `HTML 版の作例が読み込む global.css の \`:root\` にあるのは ${familyList(g.analysis.rootFamilies)} だけです。` +
        (g.analysis.tokensOnlyFamilies.length
          ? `${familyList(g.analysis.tokensOnlyFamilies)} は tokens.css にしかないため、使うときは tokens.css を global.css より先に読み込んでください。`
          : "") +
        "読み込む順番は `get_setup` にあります。",
    );
  }
  return finalize(body.join("\n"), [tokenSrc], s.manifest, now);
}

export function getSetup(s: SnapshotStore, a: { full?: boolean }, now: Date): string {
  const tokenSrc: Source = { kind: "tokens", version: s.tokens.version };
  const g = globalCss(s);
  if (!g) {
    return finalize(
      `スナップショットに global.css がありません。\`${UPDATE_COMMAND}\` で取り直してください。`,
      [tokenSrc],
      s.manifest,
      now,
    );
  }
  const an = g.analysis;
  let fonts: string[] = [];
  for (const c of s.repos.html.components) {
    for (const f of c.files) if (f.path.endsWith(".html") && !fonts.length) fonts = fontLinkTags(f.content);
  }
  const omitRoot = !a.full && an.differing.length === 0 && an.rootFamilies.length > 0;
  const items: Item[] = [
    fixed(
      [
        "# HTML 版コンポーネントの共通の土台",
        "",
        "HTML 版の作例を使うときは、次の順に読み込みます。作例そのものは global.css しか読み込んでいませんが、tokens.css も読み込んでください（理由は「global.css と tokens.css」）。",
        "",
        fence(
          "html",
          [
            ...fonts,
            tokensLink(s.tokens.version),
            '<link rel="stylesheet" href="global.css">',
            "<!-- 続けて各コンポーネントの CSS。get_component の「読み込むファイル」を参照 -->",
          ].join("\n"),
        ),
        "",
        "tokens.css は npm（`npm install @digital-go-jp/design-tokens`）からも読み込めます。global.css は下に載せています。",
      ].join("\n"),
    ),
    fixed(
      [
        "## global.css と tokens.css",
        "",
        `- global.css の \`:root\` にある変数: ${familyList(an.rootFamilies) || "なし"}`,
        an.differing.length
          ? `- このうち tokens.css にないか、値が違う変数: ${an.differing.map((v) => `\`${v}\``).join("、")}`
          : "- これらの値は tokens.css と同じです",
        `- tokens.css にだけある変数: ${familyList(an.tokensOnlyFamilies) || "なし"}`,
        "- global.css だけを読み込んで、tokens.css にだけある変数を `var()` で使うと、エラーは出ずにその指定が効きません（角丸が付かないなど）",
      ].join("\n"),
    ),
  ];
  if (an.utilities.length) {
    items.push(fixed(["## global.css にあるユーティリティクラス", "", an.utilities.map((u) => `\`.${u}\``).join("、")].join("\n")));
  }
  items.push(fixed("## global.css"));
  if (omitRoot) items.push(fixed("`:root` の変数の宣言は tokens.css と同じため省きました。`full: true` で全文を返します。"));
  items.push({
    kind: "content",
    lang: "css",
    body: omitRoot ? an.withoutRoot : g.file.content,
    sources: [g.source],
    label: "global.css",
    hint: omitRoot ? "get_setup()" : "get_setup(full: true)",
    local: s.sharedPath("html", "global.css"),
  });
  const { body, sources } = assemble(items);
  return finalize(body, [...sources, tokenSrc], s.manifest, now);
}

// ---- search と get_page ----

const KIND_LABEL: Record<SearchKind, string> = { guide: "ガイドライン", html: "HTML版ドキュメント", react: "React版ドキュメント" };

/** 検索語のどれかとファイル名が同じファイルと、それを返す呼び出し方 */
function fileMatches(s: SnapshotStore, query: string): string[] {
  const terms = new Set(query.normalize("NFKC").toLowerCase().split(/\s+/).filter((t) => t.includes(".")));
  if (!terms.size) return [];
  const out: string[] = [];
  for (const f of s.repos.html.shared) {
    if (terms.has(path.posix.basename(f.path).toLowerCase())) out.push(`${f.path}（HTML 版の共通ファイル）: \`get_setup()\``);
  }
  for (const kind of ["html", "react"] as const) {
    for (const comp of s.repos[kind].components) {
      const entry = s.components.find((c) => (kind === "html" ? c.htmlDir : c.reactDir) === comp.dir);
      if (!entry) continue;
      for (const f of comp.files) {
        if (terms.has(path.posix.basename(f.path).toLowerCase())) {
          out.push(`${comp.dir}/${f.path}（${kind === "html" ? "HTML 版" : "React 版"}）: \`get_component(${quote(entry.slug)}, file: ${quote(f.path)})\``);
        }
      }
    }
  }
  return out;
}

export function search(s: SnapshotStore, a: { query: string; limit?: number }, now: Date): string {
  const limit = Math.min(Math.max(a.limit ?? 10, 1), 50);
  const hits = searchIndex(s.search, a.query, limit);
  const files = fileMatches(s, a.query);
  if (hits.length === 0 && files.length === 0) {
    return finalize(`「${a.query}」に一致するページはありませんでした。`, [topSource(s)], s.manifest, now);
  }
  const lines = [`# 「${a.query}」の検索結果（${hits.length} 件）`, ""];
  if (files.length) lines.push("同じ名前のファイル:", "", ...files.map((f) => `- ${f}`), "");
  for (const h of hits) lines.push(`- [${h.title} / ${h.heading}](${h.url})（${KIND_LABEL[h.kind]}）`, `  ${h.snippet}`);
  const sources = hits.map((h): Source =>
    h.kind !== "guide" && h.ref ? fileSource(s, h.kind, h.ref.dir, h.ref.file) : { kind: "site", title: h.title, url: h.url },
  );
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
