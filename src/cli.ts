#!/usr/bin/env node
import os from "node:os";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createHttp } from "./http.js";
import { resolveCacheDir } from "./paths.js";
import { createServer, createStoreProvider } from "./server.js";
import { SnapshotStore } from "./snapshot/store.js";
import { runUpdate, UpdateAbortedError, UpdateInProgressError } from "./snapshot/update.js";
import { UPDATE_COMMAND, VERSION } from "./version.js";

const USAGE = `dads-mcp ${VERSION}（デジタル庁デザインシステムの非公式 MCP サーバー）

使い方:
  dads-mcp           MCP サーバーを起動（stdio）
  dads-mcp update    データを取得・更新
  dads-mcp status    保存しているデータの状態を表示`;

const logErr = (msg: string) => console.error(`[dads-mcp] ${msg}`);

export async function main(argv: string[]): Promise<number> {
  const cacheDir = resolveCacheDir(process.env, process.platform, os.homedir());
  const update = () => runUpdate({ cacheDir, http: createHttp(), log: logErr });
  const [cmd, ...rest] = argv;

  if (cmd === undefined) {
    const provider = createStoreProvider(cacheDir, update);
    void provider().catch((e: unknown) => logErr(String(e)));
    await createServer(provider).connect(new StdioServerTransport());
    return 0;
  }
  if (rest.length > 0) {
    console.error(USAGE);
    return 1;
  }
  if (cmd === "update") {
    try {
      const m = await update();
      for (const w of m.warnings) logErr(`警告: ${w}`);
      console.log(`更新しました: ページ ${m.counts.pages} 件、コンポーネント ${m.counts.components} 件、警告 ${m.warnings.length} 件`);
      return 0;
    } catch (e) {
      if (e instanceof UpdateInProgressError || e instanceof UpdateAbortedError) {
        logErr(e.message);
        return 1;
      }
      throw e;
    }
  }
  if (cmd === "status") {
    const s = await SnapshotStore.open(cacheDir);
    console.log(`保存場所: ${cacheDir}`);
    if (!s) {
      console.log(`スナップショットはまだありません。\`${UPDATE_COMMAND}\` で取得できます。`);
      return 0;
    }
    const m = s.manifest;
    console.log(`取得日時: ${m.fetchedAt}`);
    console.log(`ページ ${m.counts.pages} 件、コンポーネント ${m.counts.components} 件、警告 ${m.warnings.length} 件`);
    console.log(`トークン: @digital-go-jp/design-tokens v${m.tokensVersion}`);
    return 0;
  }
  if (cmd === "--version" || cmd === "-v") {
    console.log(VERSION);
    return 0;
  }
  console.error(USAGE);
  return cmd === "--help" || cmd === "-h" ? 0 : 1;
}

main(process.argv.slice(2)).then(
  (code) => {
    process.exitCode = code;
  },
  (e: unknown) => {
    logErr(e instanceof Error ? (e.stack ?? e.message) : String(e));
    process.exitCode = 1;
  },
);
