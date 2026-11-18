import * as cheerio from "cheerio";
import TurndownService from "turndown";
import { gfm } from "turndown-plugin-gfm";
import type { PageDoc } from "../types.js";
import { SITE_BASE, urlToPath } from "./sitemap.js";

const TITLE_SUFFIX = /\s*｜\s*デジタル庁デザインシステムβ版\s*$/;
const RESOURCES_HEADING = "各種リソース";
const REPO_LINK = /design-system-example-components-(html|react)\/tree\/[^/]+\/src\/components\/([^/?#]+)/;

const turndown = new TurndownService({ headingStyle: "atx", codeBlockStyle: "fenced", bulletListMarker: "-" });
turndown.use(gfm);

function absolutize(value: string): string {
  try {
    return new URL(value, SITE_BASE).toString();
  } catch {
    return value;
  }
}

export function convertPage(html: string, url: string): PageDoc {
  const $ = cheerio.load(html);
  const title = $("title").first().text().replace(TITLE_SUFFIX, "").trim();
  const updated = $("main time[datetime]").first().attr("datetime")?.trim() || undefined;

  let body = $("main .dads-main__body .prose").first();
  if (body.length === 0) body = $("main").first();

  const resourceLinks: PageDoc["resourceLinks"] = {};
  body.find("h2").each((_, h) => {
    const heading = $(h);
    if (heading.text().trim() !== RESOURCES_HEADING) return;
    const section = heading.nextUntil("h2");
    section.find("a[href]").each((_, a) => {
      const m = REPO_LINK.exec($(a).attr("href") ?? "");
      if (m) resourceLinks[m[1] as "html" | "react"] ??= decodeURIComponent(m[2]);
    });
    section.remove();
    heading.remove();
  });

  body.find("svg, style, script, nav, .dads-main__toc, .dads-main__tabs, .dads-main__header").remove();
  body.find("img[src]").each((_, el) => {
    $(el).attr("src", absolutize($(el).attr("src")!));
  });
  body.find("a[href]").each((_, el) => {
    $(el).attr("href", absolutize($(el).attr("href")!));
  });

  const content = turndown.turndown(body.html() ?? "").trim();
  return {
    path: urlToPath(url),
    url,
    title,
    updated,
    markdown: `# ${title}\n\n${content}\n`,
    resourceLinks,
  };
}
