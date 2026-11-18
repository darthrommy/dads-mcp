import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { expect, test, vi } from "vitest";
import { CURRENT, FILES } from "../src/snapshot/layout.js";
import { SnapshotStore } from "../src/snapshot/store.js";
import { SNAPSHOT_SHA, writeFixtureSnapshot } from "./fixtures/snapshot.js";

const tmp = () => mkdtempSync(path.join(os.tmpdir(), "dads-store-"));

test("opens fixture snapshot", async () => {
  const dir = tmp();
  await writeFixtureSnapshot(dir);
  const s = (await SnapshotStore.open(dir))!;
  expect(s.manifest.tokensVersion).toBe("2.1.0");
  expect(s.getPage("components/button")?.title).toBe("ボタン（概要）");
  expect(s.listPages("foundations/").map((p) => p.path)).toEqual(["foundations/color", "foundations/color/color-palette", "foundations/spacing"]);
  expect(s.components.map((c) => c.slug)).toEqual(["breadcrumb", "button"]);
  expect(s.repos.react.sha).toBe(SNAPSHOT_SHA);
  expect(s.repos.html.components.find((c) => c.dir === "button")?.files.map((f) => f.path)).toEqual(["button.css", "button.md", "playground.html"]);
  expect(s.tokens.css).toContain("--color-primitive-blue-50");
  expect(s.search.sections.length).toBeGreaterThan(0);
});

test("returns null when absent", async () => {
  expect(await SnapshotStore.open(tmp())).toBeNull();
});

test("treats mismatched schema or corrupt cache as absent", async () => {
  const err = vi.spyOn(console, "error").mockImplementation(() => {});
  const a = tmp();
  await writeFixtureSnapshot(a);
  const mf = path.join(a, CURRENT, FILES.manifest);
  writeFileSync(mf, JSON.stringify({ ...JSON.parse(readFileSync(mf, "utf8")), schemaVersion: 2 }));
  expect(await SnapshotStore.open(a)).toBeNull();

  const b = tmp();
  await writeFixtureSnapshot(b);
  writeFileSync(path.join(b, CURRENT, FILES.components), "{ broken");
  expect(await SnapshotStore.open(b)).toBeNull();
  expect(err).toHaveBeenCalled();
  err.mockRestore();
});

test("treats non-object manifest as absent", async () => {
  const err = vi.spyOn(console, "error").mockImplementation(() => {});
  const a = tmp();
  await writeFixtureSnapshot(a);
  writeFileSync(path.join(a, CURRENT, FILES.manifest), "null");
  expect(await SnapshotStore.open(a)).toBeNull();
  err.mockRestore();
});
