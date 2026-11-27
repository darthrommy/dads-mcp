export interface VarFamily {
  /** "--color-primitive-*" */
  family: string;
  count: number;
}

export interface GlobalCssAnalysis {
  /** global.css の :root で宣言されている変数 */
  rootFamilies: VarFamily[];
  /** tokens.css にあって global.css の :root にない変数 */
  tokensOnlyFamilies: VarFamily[];
  /** global.css の :root にあり、tokens.css にないか値が違う変数 */
  differing: string[];
  /** .dads-u- で始まるユーティリティクラス（出てくる順） */
  utilities: string[];
  /** :root のブロックを除いた global.css */
  withoutRoot: string;
}

const ROOT_BLOCK = /:root\s*\{[^}]*\}/g;
const stripComments = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, "");

function declarations(css: string): Map<string, string> {
  return new Map([...css.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]));
}

/** 名前の先頭から、数字でない語を 2 つまで取る: --color-primitive-blue-50 → --color-primitive-* */
function familyOf(name: string): string {
  const words: string[] = [];
  for (const w of name.slice(2).split("-")) {
    if (/^\d/.test(w) || words.length === 2) break;
    words.push(w);
  }
  return `--${words.join("-")}-*`;
}

function families(names: string[]): VarFamily[] {
  const counts = new Map<string, number>();
  for (const n of names) counts.set(familyOf(n), (counts.get(familyOf(n)) ?? 0) + 1);
  return [...counts].map(([family, count]) => ({ family, count }));
}

const sameValue = (a: string, b: string) => {
  const n = (v: string) => v.replace(/'/g, '"').replace(/\s+/g, "").toLowerCase();
  return n(a) === n(b);
};

export function analyzeGlobalCss(globalCss: string, tokensCss: string): GlobalCssAnalysis {
  const stripped = stripComments(globalCss);
  const root = declarations([...stripped.matchAll(ROOT_BLOCK)].map((m) => m[0]).join("\n"));
  const tokens = declarations(stripComments(tokensCss));
  return {
    rootFamilies: families([...root.keys()]),
    tokensOnlyFamilies: families([...tokens.keys()].filter((k) => !root.has(k))),
    differing: [...root].filter(([k, v]) => !tokens.has(k) || !sameValue(v, tokens.get(k)!)).map(([k]) => k),
    utilities: [...new Set([...stripped.matchAll(/\.(dads-u-[\w-]+)/g)].map((m) => m[1]))],
    withoutRoot: globalCss.replace(new RegExp(`${ROOT_BLOCK.source}\\s*`, "g"), "").trim(),
  };
}

export const familyList = (fs: VarFamily[]) => fs.map((f) => `\`${f.family}\`（${f.count} 個）`).join("、");
