# dads-mcp

デジタル庁デザインシステム（DADS）の非公式 MCP サーバー。ガイドラインサイト、example components の 2 リポジトリ、`@digital-go-jp/design-tokens` を取得してローカルのスナップショットにし、8 つのツールで返す。

## コマンド

- `npm test`: フィクスチャを使うテスト。ネットワークに出ない
- `npm run test:live`: 実サイトから取得して変換できるか確かめる。週 1 回の Live site check はこれを動かしている
- `npm run typecheck`、`npm run build`
- Node.js 22 以上

## 守ること

- design.digital.go.jp のガイドライン本文を、リポジトリのどこにも入れない。フィクスチャ、テスト、ドキュメント、コミットメッセージ、プルリクエストの本文も含む。サイトの文章にはライセンスが示されていないため、取得はユーザーの手元で行い、リポジトリには取得と変換のコードだけを置く
- `tests/fixtures/` の HTML とリポジトリのファイルは、すべて手書きの架空の内容にする。サイトの構造が変わったときは、タグ、クラス名、入れ子の形だけを写し、文章は架空のものを書く
- 調べるために取得した HTML はリポジトリの外（`/tmp` や `$RUNNER_TEMP`）に置き、終わったら消す
- ツールの応答に付く出典の行（`出典: ...` と `取得日: ...`）を消さない。形式は `src/tools/format.ts` にある
- サーバーとして動いているとき、標準出力は MCP の通信に使う。ログは `console.error` で標準エラーに出す。`console.log` を使ってよいのは `src/cli.ts` の `update` と `status` だけ
- 直すときは先に失敗するテストを書き、フィクスチャでその変化を再現してから直す

## 実サイトの変化で落ちたとき

どこを見るか:

- ページ一覧: `src/site/sitemap.ts`（`sitemap-index.xml` → `sitemap-0.xml`）
- 本文の取り出しと Markdown 変換: `src/site/convert.ts`。本文の位置、タイトルの接尾辞、「各種リソース」の表から HTML / React のディレクトリ名を読む部分
- example components の取得: `src/repos/github.ts`（含めるファイルと除くファイル、`src/global.css` のようなコンポーネント外の共通ファイル）
- 作例 HTML の `<head>` と `<body>` の分け方、読み込むファイルの読み取り: `src/examples.ts`
- トークン: `src/tokens/fetch.ts`
- ガイドラインのページとリポジトリのディレクトリの対応: `src/catalog.ts`。自動で対応づけられないものは `data/name-overrides.json` に書く

更新は、ページの 20% 以上の取得か変換に失敗すると中止する。中止のメッセージに最初の 3 件の理由が出る。

直したら `npm test` と `npm run test:live` の両方を通す。
