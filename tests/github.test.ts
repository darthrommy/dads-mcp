import { expect, test } from "vitest";
import type { Http } from "../src/http.js";
import { HttpError } from "../src/http.js";
import { extractComponents, fetchRepo, githubFileUrl, tarballUrl } from "../src/repos/github.js";
import { makeRepoTarball } from "./helpers.js";

const paths = (files: { path: string }[]) => files.map((f) => f.path).sort();

test("extracts html component files", async () => {
  const comps = await extractComponents(await makeRepoTarball("html"), "html");
  expect(comps.map((c) => c.dir)).toEqual(["test-button"]);
  expect(paths(comps[0].files)).toEqual(["playground.html", "test-button.css", "test-button.md"]);
  expect(comps[0].files.find((f) => f.path === "test-button.css")?.content).toContain(".dads-test-button");
});

test("extracts react component files and skips binaries and stories", async () => {
  const comps = await extractComponents(await makeRepoTarball("react"), "react");
  expect(comps.map((c) => c.dir)).toEqual(["TestButton"]);
  expect(paths(comps[0].files)).toEqual(["TestButton.tsx", "component-spec.md", "index.ts"]);
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
});

test("githubFileUrl", () => {
  expect(githubFileUrl("react", "Button", "Button.tsx", "abcdef0123")).toBe(
    "https://github.com/digital-go-jp/design-system-example-components-react/blob/abcdef0123/src/components/Button/Button.tsx",
  );
  expect(githubFileUrl("html", "button", "button.css")).toBe(
    "https://github.com/digital-go-jp/design-system-example-components-html/blob/main/src/components/button/button.css",
  );
});
