export interface SpecAttribute {
  name: string;
  /** 空なら、付けるかどうかだけで切り替わる属性 */
  values: string[];
}

export interface SpecBlock {
  block: string;
  elements: string[];
  modifiers: string[];
}

export interface Spec {
  attributes: SpecAttribute[];
  blocks: SpecBlock[];
}

const ATTR = /\[\s*((?:data|aria)-[\w-]+)\s*(?:([~|^$*]?=)\s*(?:"([^"]*)"|'([^']*)'|([^\]\s]+)))?\s*(?:[iIsS]\s*)?\]/g;
const CLASS = /\.(-?[_a-zA-Z][\w-]*)/g;
const byText = (a: string, b: string) => a.localeCompare(b, "en", { numeric: true });

/** CSS のセレクタから data-* / aria-* 属性とその値、dads- で始まる BEM のクラスを抜き出す */
export function extractSpec(cssFiles: string[]): Spec {
  const attrs = new Map<string, Set<string>>();
  const blocks = new Map<string, { elements: Set<string>; modifiers: Set<string> }>();
  for (const css of cssFiles) {
    const stripped = css.replace(/\/\*[\s\S]*?\*\//g, "");
    for (const [, prelude] of stripped.matchAll(/([^{};]+)\{/g)) {
      if (prelude.trim().startsWith("@")) continue;
      for (const m of prelude.matchAll(ATTR)) {
        const values = attrs.get(m[1]) ?? new Set<string>();
        const value = m[3] ?? m[4] ?? m[5];
        if (value !== undefined) values.add(m[2] === "=" ? value : `${m[2]}${value}`);
        attrs.set(m[1], values);
      }
      for (const [, name] of prelude.matchAll(CLASS)) {
        if (!name.startsWith("dads-") || name.startsWith("dads-u-")) continue;
        const el = name.indexOf("__");
        const mod = name.indexOf("--");
        const block = el >= 0 ? name.slice(0, el) : mod >= 0 ? name.slice(0, mod) : name;
        const entry = blocks.get(block) ?? { elements: new Set<string>(), modifiers: new Set<string>() };
        if (el >= 0) entry.elements.add(name.slice(el + 2));
        else if (mod >= 0) entry.modifiers.add(name.slice(mod + 2));
        blocks.set(block, entry);
      }
    }
  }
  const attributes = [...attrs]
    .map(([name, values]) => ({ name, values: [...values].sort(byText) }))
    .sort((a, b) => Number(a.name.startsWith("aria-")) - Number(b.name.startsWith("aria-")) || byText(a.name, b.name));
  return {
    attributes,
    blocks: [...blocks]
      .map(([block, e]) => ({ block, elements: [...e.elements].sort(byText), modifiers: [...e.modifiers].sort(byText) }))
      .sort((a, b) => byText(a.block, b.block)),
  };
}

export function formatSpec(spec: Spec): string {
  const lines = ["CSS のセレクタから機械的に抜き出した属性とクラスです。値が「（値なし）」の属性は、付けるかどうかで見た目が変わります。"];
  if (spec.attributes.length) {
    lines.push("", "| 属性 | 値 |", "| --- | --- |");
    for (const a of spec.attributes) lines.push(`| ${a.name} | ${a.values.length ? a.values.join(", ") : "（値なし）"} |`);
  }
  if (spec.blocks.length) {
    lines.push("", "| クラス | 要素（__） | 修飾子（--） |", "| --- | --- | --- |");
    for (const b of spec.blocks) {
      const list = (xs: string[], p: string) => (xs.length ? xs.map((x) => `${p}${x}`).join(", ") : "−");
      lines.push(`| ${b.block} | ${list(b.elements, "__")} | ${list(b.modifiers, "--")} |`);
    }
  }
  if (!spec.attributes.length && !spec.blocks.length) lines.push("", "（抜き出せる属性とクラスはありません）");
  return lines.join("\n");
}
