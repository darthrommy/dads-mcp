import { expect, test } from "vitest";
import type { Http } from "../src/http.js";
import { HttpError } from "../src/http.js";
import { extractRepo, fetchRepo, githubFileUrl, githubPathUrl, tarballUrl } from "../src/repos/github.js";
import { makeRepoTarball } from "./helpers.js";

const paths = (files: { path: string }[]) => files.map((f) => f.path).sort();

test("extracts html component files, scripts and global.css", async () => {
  const { components: comps, shared } = await extractRepo(await makeRepoTarball("html"), "html");
  expect(comps.map((c) => c.dir)).toEqual(["test-button"]);
  expect(paths(comps[0].files)).toEqual(["playground.html", "test-button.css", "test-button.js", "test-button.md"]);
  expect(comps[0].files.find((f) => f.path === "test-button.css")?.content).toContain(".dads-test-button");
  expect(shared.map((f) => f.path)).toEqual(["global.css"]);
  expect(shared[0].content).toContain(".dads-u-visually-hidden");
});

test("extracts react component files and stories but skips binaries and mdx", async () => {
  const { components: comps, shared } = await extractRepo(await makeRepoTarball("react"), "react");
  expect(comps.map((c) => c.dir)).toEqual(["TestButton"]);
  expect(paths(comps[0].files)).toEqual(["TestButton.stories.tsx", "TestButton.tsx", "component-spec.md", "index.ts"]);
  expect(shared).toEqual([]);
});

test("fetchRepo continues without sha", async () => {
  const tgz = await makeRepoTarball("html");
  const http: Http = {
    text: async () => "",
    buffer: async (url) => {
      expect(url).toBe(tarballUrl("html"));
      return tgz;
    },
    json: async (url) => {
      throw new HttpError(500, url);
    },
  };
  const snap = await fetchRepo(http, "html");
  expect(snap.kind).toBe("html");
  expect(snap.sha).toBeUndefined();
  expect(snap.components).toHaveLength(1);
  expect(snap.shared.map((f) => f.path)).toEqual(["global.css"]);
});

test("githubFileUrl", () => {
  expect(githubFileUrl("react", "Button", "Button.tsx", "abcdef0123")).toBe(
    "https://github.com/digital-go-jp/design-system-example-components-react/blob/abcdef0123/src/components/Button/Button.tsx",
  );
  expect(githubPathUrl("html", "src/global.css", "abcdef0123")).toBe(
    "https://github.com/digital-go-jp/design-system-example-components-html/blob/abcdef0123/src/global.css",
  );
  expect(githubFileUrl("html", "button", "button.css")).toBe(
    "https://github.com/digital-go-jp/design-system-example-components-html/blob/main/src/components/button/button.css",
  );
});
