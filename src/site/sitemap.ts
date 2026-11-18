export const SITE_BASE = "https://design.digital.go.jp/dads/";

export function parseSitemapLocs(xml: string): string[] {
  return [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map((m) => m[1]);
}

export function urlToPath(url: string): string {
  const rest = url.startsWith(SITE_BASE) ? url.slice(SITE_BASE.length) : new URL(url).pathname.replace(/^\/dads\//, "");
  const p = rest.replace(/[?#].*$/, "").replace(/^\/+|\/+$/g, "");
  return p === "" ? "index" : p;
}

export function filterPageUrls(urls: string[]): string[] {
  return urls.filter((u) => {
    if (!u.startsWith(SITE_BASE)) return false;
    const p = urlToPath(u);
    if (p === "search" || p.startsWith("search/")) return false;
    if (p.startsWith("updates-")) return false;
    if (p.split("/").includes("changelog")) return false;
    return true;
  });
}
