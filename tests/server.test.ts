import { mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { expect, test } from "vitest";
import { createServer, createStoreProvider, FIRST_FETCH_WAIT_MS, PENDING_MESSAGE } from "../src/server.js";
import { UPDATE_COMMAND } from "../src/version.js";
import { SnapshotStore } from "../src/snapshot/store.js";
import { writeFixtureSnapshot } from "./fixtures/snapshot.js";

async function connect(getStore: Parameters<typeof createServer>[0]) {
  const server = createServer(getStore, () => new Date("2026-11-18T12:00:00Z"));
  const [a, b] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "test", version: "0.0.0" });
  await Promise.all([server.connect(a), client.connect(b)]);
  return client;
}
const textOf = (r: unknown) => ((r as { content: { text: string }[] }).content[0]?.text ?? "");

test("lists eight tools", async () => {
  const client = await connect(async () => "pending");
  const { tools } = await client.listTools();
  expect(tools.map((t) => t.name).sort()).toEqual(
    ["get_component", "get_foundation", "get_page", "get_setup", "get_tokens", "list_components", "list_foundations", "search"].sort(),
  );
  expect(tools.every((t) => (t.description ?? "").length > 0)).toBe(true);
});

test("calls get_component", async () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "dads-srv-"));
  await writeFixtureSnapshot(dir);
  const store = (await SnapshotStore.open(dir))!;
  const client = await connect(async () => store);
  const r = await client.callTool({ name: "get_component", arguments: { name: "button", parts: ["react"] } });
  expect(textOf(r)).toContain("出典:");
  expect(textOf(r)).toContain("```tsx");
});

test("rejects invalid parts", async () => {
  const client = await connect(async () => "pending");
  const r = await client.callTool({ name: "get_component", arguments: { name: "button", parts: ["nope"] } });
  expect(r.isError).toBe(true);
});

test("returns pending message", async () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "dads-srv-"));
  const provider = createStoreProvider(dir, () => new Promise(() => {}), 50);
  const client = await connect(provider);
  const r = await client.callTool({ name: "list_components", arguments: {} });
  expect(r.isError).toBe(true);
  expect(textOf(r)).toBe(PENDING_MESSAGE);
});

test("starts update only once", async () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "dads-srv-"));
  let calls = 0;
  const provider = createStoreProvider(
    dir,
    async () => {
      calls++;
      await new Promise((r) => setTimeout(r, 30));
      await writeFixtureSnapshot(dir);
    },
    5000,
  );
  const results = await Promise.all([provider(), provider(), provider()]);
  expect(calls).toBe(1);
  expect(results.every((r) => r instanceof SnapshotStore)).toBe(true);
});

test("retries update after failure", async () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "dads-srv-"));
  let calls = 0;
  const provider = createStoreProvider(
    dir,
    async () => {
      calls++;
      if (calls === 1) throw new Error("offline");
      await writeFixtureSnapshot(dir);
    },
    1000,
  );
  expect(await provider()).toEqual({ error: "offline" });
  expect(await provider()).toBeInstanceOf(SnapshotStore);
  expect(calls).toBe(2);
});

test("reloads after an external update", async () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "dads-srv-"));
  await writeFixtureSnapshot(dir, { fetchedAt: "2026-11-01T00:00:00.000Z" });
  const provider = createStoreProvider(dir, async () => {}, 1000);
  const first = (await provider()) as SnapshotStore;
  expect(first.manifest.fetchedAt).toBe("2026-11-01T00:00:00.000Z");
  await new Promise((r) => setTimeout(r, 20));
  await writeFixtureSnapshot(dir, { fetchedAt: "2026-11-18T00:00:00.000Z" });
  const second = (await provider()) as SnapshotStore;
  expect(second.manifest.fetchedAt).toBe("2026-11-18T00:00:00.000Z");
});

test("reports fetch failure instead of pending", async () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "dads-srv-"));
  const provider = createStoreProvider(dir, async () => { throw new Error("fetch failed"); }, 1000);
  const client = await connect(provider);
  const r = await client.callTool({ name: "list_components", arguments: {} });
  expect(r.isError).toBe(true);
  expect(textOf(r)).toContain("データ取得に失敗しました: fetch failed");
  expect(textOf(r)).toContain(UPDATE_COMMAND);
});

test("first fetch wait stays under common 60s client timeouts", () => {
  expect(FIRST_FETCH_WAIT_MS).toBeLessThan(60_000);
});
