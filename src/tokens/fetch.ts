import type { Http } from "../http.js";
import { readTarFiles } from "../tarball.js";
import type { TokenSnapshot } from "../types.js";

const REGISTRY_LATEST = "https://registry.npmjs.org/@digital-go-jp/design-tokens/latest";
const CSS = "package/dist/tokens.css";
const SIMPLE_CSS = "package/dist/tokens-simple.css";

export async function fetchTokens(http: Http): Promise<TokenSnapshot> {
  const meta = await http.json<{ version: string; dist: { tarball: string } }>(REGISTRY_LATEST);
  const files = await readTarFiles(await http.buffer(meta.dist.tarball), (p) => p === CSS || p === SIMPLE_CSS);
  const css = files.get(CSS);
  const simpleCss = files.get(SIMPLE_CSS);
  if (!css || !simpleCss) throw new Error(`design-tokens ${meta.version}: dist/tokens.css が見つかりません`);
  const jsonText = await http.text(
    `https://raw.githubusercontent.com/digital-go-jp/design-tokens/v${meta.version}/figma/tokens.json`,
  );
  return { version: meta.version, css, simpleCss, json: JSON.parse(jsonText) as Record<string, unknown> };
}
