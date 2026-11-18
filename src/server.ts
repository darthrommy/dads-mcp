import { stat } from "node:fs/promises";
import path from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { CURRENT, FILES } from "./snapshot/layout.js";
import { SnapshotStore } from "./snapshot/store.js";
import * as h from "./tools/handlers.js";
import { UPDATE_COMMAND, VERSION } from "./version.js";

export const FIRST_FETCH_WAIT_MS = 50_000;
export const PENDING_MESSAGE = `初回データ取得中。しばらくしてから再実行するか、\`${UPDATE_COMMAND}\` を実行してください`;

export type StoreResult = SnapshotStore | "pending" | { error: string };
type Provider = () => Promise<StoreResult>;

export const failureMessage = (reason: string) =>
  `データ取得に失敗しました: ${reason}\nネットワークを確認して、もう一度試すか \`${UPDATE_COMMAND}\` を実行してください`;

export function createStoreProvider(cacheDir: string, update: () => Promise<unknown>, waitMs = FIRST_FETCH_WAIT_MS): Provider {
  const manifestPath = path.join(cacheDir, CURRENT, FILES.manifest);
  let cached: SnapshotStore | null = null;
  let cachedMtime = 0;
  let inflight: Promise<string | undefined> | null = null;

  const mtime = async () => {
    try {
      return (await stat(manifestPath)).mtimeMs;
    } catch {
      return 0;
    }
  };
  const tryOpen = async () => {
    const m = await mtime();
    if (cached && m === cachedMtime) return cached;
    const s = await SnapshotStore.open(cacheDir);
    if (s) {
      cached = s;
      cachedMtime = m;
    }
    return s ?? cached;
  };

  return async () => {
    const s = await tryOpen();
    if (s) return s;
    if (!inflight) {
      console.error("[dads-mcp] スナップショットがないため取得を始めます");
      inflight = update()
        .then(
          () => undefined,
          (e: unknown) => {
            const reason = e instanceof Error ? e.message : String(e);
            console.error(`[dads-mcp] データ取得に失敗しました: ${reason}`);
            return reason;
          },
        )
        .finally(() => {
          inflight = null;
        });
    }
    const current = inflight;
    let timer: NodeJS.Timeout | undefined;
    const TIMEOUT = Symbol("timeout");
    const outcome = await Promise.race([
      current,
      new Promise<typeof TIMEOUT>((r) => {
        timer = setTimeout(() => r(TIMEOUT), waitMs);
        timer.unref?.();
      }),
    ]);
    clearTimeout(timer);
    if (outcome === TIMEOUT) return "pending";
    const opened = await tryOpen();
    if (opened) return opened;
    return typeof outcome === "string" ? { error: outcome } : "pending";
  };
}

export function createServer(getStore: Provider, now: () => Date = () => new Date()): McpServer {
  const server = new McpServer({ name: "dads-mcp", version: VERSION });

  const tool = <A>(fn: (s: SnapshotStore, a: A, now: Date) => string) =>
    async (args: A) => {
      const s = await getStore();
      if (s === "pending") return { content: [{ type: "text" as const, text: PENDING_MESSAGE }], isError: true };
      if ("error" in s) return { content: [{ type: "text" as const, text: failureMessage(s.error) }], isError: true };
      return { content: [{ type: "text" as const, text: fn(s, args, now()) }] };
    };

  server.registerTool(
    "list_components",
    { description: "デジタル庁デザインシステムのコンポーネント一覧（名前、日本語名、概要、ガイドライン・HTML・React の有無）を返します。" },
    async () => tool(h.listComponents)({} as Record<string, never>),
  );
  server.registerTool(
    "get_component",
    {
      description:
        "コンポーネント 1 つのガイドライン（概要・使い方・アクセシビリティ）と HTML / CSS / React のコードを返します。name は英語の slug、日本語名、React のコンポーネント名のどれでも指定できます。",
      inputSchema: {
        name: z.string().describe("例: button、ボタン、Breadcrumbs"),
        parts: z.array(z.enum(h.COMPONENT_PARTS)).optional().describe("返す部分。省略時は overview, usage, accessibility, html"),
      },
    },
    tool(h.getComponent),
  );
  server.registerTool(
    "list_foundations",
    { description: "基本ルール（色、文字、余白、レイアウトなど）の項目とサブページの一覧を返します。" },
    async () => tool(h.listFoundations)({} as Record<string, never>),
  );
  server.registerTool(
    "get_foundation",
    {
      description: "基本ルール（foundations）のページ本文を返します。",
      inputSchema: {
        topic: z.string().describe("例: color, typography, spacing, layout"),
        subpage: z.string().optional().describe("例: color-palette, text-style, accessibility"),
      },
    },
    tool(h.getFoundation),
  );
  server.registerTool(
    "get_tokens",
    {
      description: "デザイントークン（色、文字、角丸、影）の CSS 変数または JSON と、読み込み方法を返します。",
      inputSchema: {
        category: z.string().optional().describe("color, typography, radius, elevation。省略時はすべて"),
        format: z.enum(["css", "json"]).optional().describe("省略時は css"),
      },
    },
    tool(h.getTokens),
  );
  server.registerTool(
    "search",
    {
      description: "ガイドライン全体をキーワードで検索し、該当するページと抜粋を返します。空白区切りで複数語を指定すると、すべてを含むものを返します。",
      inputSchema: {
        query: z.string().describe("検索語"),
        limit: z.number().int().min(1).max(50).optional().describe("最大件数。省略時は 10"),
      },
    },
    tool(h.search),
  );
  server.registerTool(
    "get_page",
    {
      description: "ガイドラインサイトの任意のページ（guidance、introduction、webaccessibility など）の本文を返します。",
      inputSchema: { path: z.string().describe("例: guidance/how-to-use、または https://design.digital.go.jp/dads/... の URL") },
    },
    tool(h.getPage),
  );
  return server;
}
