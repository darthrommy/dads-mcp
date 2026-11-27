export interface PageDoc {
  /** "components/button/usage"。トップページは "index" */
  path: string;
  /** 絶対 URL（末尾スラッシュあり） */
  url: string;
  /** <title> から「｜デジタル庁デザインシステムβ版」を除いたもの */
  title: string;
  /** "2026-10-21" */
  updated?: string;
  /** "# <title>\n\n" から始まる本文 */
  markdown: string;
  /** 各種リソース表から取ったリポジトリ内ディレクトリ名 */
  resourceLinks: { html?: string; react?: string };
}

export type RepoKind = "html" | "react";

/** path はコンポーネントディレクトリからの相対パス（"/" 区切り） */
export interface ComponentFile {
  path: string;
  content: string;
}

export interface RepoComponent {
  dir: string;
  files: ComponentFile[];
}

export interface RepoSnapshot {
  kind: RepoKind;
  sha?: string;
  components: RepoComponent[];
  /** src/components の外にある共通ファイル（HTML 版の src/global.css）。path は src/ からの相対パス */
  shared: ComponentFile[];
}

export interface ComponentEntry {
  slug: string;
  nameJa: string;
  summary: string;
  htmlDir?: string;
  reactDir?: string;
  /** PageDoc.path */
  pages: { overview?: string; usage?: string; accessibility?: string };
}

export interface TokenSnapshot {
  version: string;
  css: string;
  simpleCss: string;
  json: Record<string, unknown>;
}

export interface Manifest {
  schemaVersion: number;
  /** ISO 8601 */
  fetchedAt: string;
  repos: { html?: string; react?: string };
  tokensVersion: string;
  counts: { pages: number; components: number };
  warnings: string[];
}

/** 2: shared/（global.css）、HTML 版の .js、React 版の .stories.tsx、検索索引のリポジトリ文書を追加 */
export const SCHEMA_VERSION = 2;
