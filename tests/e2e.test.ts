import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { beforeAll, expect, test } from "vitest";
import { writeFixtureSnapshot } from "./fixtures/snapshot.js";

const cli = path.resolve("dist/cli.js");
let cacheDir: string;

beforeAll(async () => {
  if (!existsSync(cli)) throw new Error("dist/cli.js がありません。先に npm run build を実行してください");
  cacheDir = mkdtempSync(path.join(os.tmpdir(), "dads-e2e-"));
  await writeFixtureSnapshot(cacheDir);
});

test("stdio server answers tools", async () => {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [cli],
    env: { ...process.env, DADS_MCP_CACHE_DIR: cacheDir } as Record<string, string>,
    stderr: "pipe",
  });
  const client = new Client({ name: "e2e", version: "0.0.0" });
  await client.connect(transport);
  const { tools } = await client.listTools();
  expect(tools).toHaveLength(7);
  const r = await client.callTool({ name: "list_components", arguments: {} });
  expect((r.content as { text: string }[])[0].text).toContain("| button |");
  await client.close();
});

test("status prints counts", () => {
  const out = execFileSync(process.execPath, [cli, "status"], { env: { ...process.env, DADS_MCP_CACHE_DIR: cacheDir }, encoding: "utf8" });
  expect(out).toContain(cacheDir);
  expect(out).toMatch(/ページ 9 件/);
});

test("unknown command exits 1", () => {
  let code = 0;
  try {
    execFileSync(process.execPath, [cli, "bogus"], { stdio: "pipe" });
  } catch (e) {
    code = (e as { status: number }).status;
  }
  expect(code).toBe(1);
});
