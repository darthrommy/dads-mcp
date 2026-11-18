# dads-mcp 設計書

作成日: 2026-11-18

デジタル庁デザインシステム（DADS、https://design.digital.go.jp/dads/ ）のガイドライン・コード・デザイントークンを、AI（Claude Code、Claude Desktop など MCP クライアント）から引けるようにする非公式 MCP サーバー。

## 1. 目的と背景

- ユーザーは、ゼミの Web ページやプレゼン資料を AI に作らせるときに、DADS の色・文字・レイアウト・コンポーネントに沿ったものにしたい。
- DADS の情報は人間向けには Figma と Storybook と Web サイトで提供されているが、AI がまとめて参照できる手段がない。
- 公開リポジトリとして世界に公開し、誰でも `npx` で使える形にする。配布は GitHub から直接行い、npm には公開しない（npm 公開は利用者が増えてから検討する）。

## 2. ゴール / 非ゴール / アンチゴール

### ゴール

- MCP ツールで次を返せる
  - デザイントークン（色、文字、余白、角丸、影など）の値。CSS 変数名と値
  - 基本ルール（foundations）の本文
  - コンポーネントごとのガイドライン本文（概要・使い方・アクセシビリティ）と HTML / CSS / React のコード
  - ガイドライン全体のキーワード検索
  - 上記以外のページ（guidance、introduction、webaccessibility など）の本文
- 標準入出力（stdio）で動き、主要な MCP クライアントで使える
- `npx -y github:darthrommy/dads-mcp` で起動でき、`npx -y github:darthrommy/dads-mcp update` で最新化できる
- ネットワークがなくても、一度取得したデータで動く

### 非ゴール（v1 ではやらない）

- Figma API 連携、Storybook のスクレイピング
- MCP 側でページやスライドを生成すること（生成は AI 側の仕事。MCP は材料を返すだけ）
- スライド専用のルール提供（DADS にスライド用のガイドラインやテンプレートは見つからなかった。スライドは foundations とトークンを当てはめて作る）
- イラストレーション・アイコン素材の配布（別の「イラストレーション・アイコン素材利用規約」があるため v1 対象外）
- 変更履歴（changelog）ページの取得

### アンチゴール（動いても失敗とみなすもの）

- ガイドライン本文を公開リポジトリに含めて再配布すること
- デジタル庁の公式ツールであるかのように見えること。デジタル庁のロゴを使うこと
- サイトの HTML 構造が変わったときに、取得済みデータでの通常利用まで壊れること
- 出典なしで本文を返すこと

## 3. 制約

### ライセンスと規約（2026-11-18 時点で確認）

| 対象 | ライセンス | 扱い |
| --- | --- | --- |
| design-system-example-components-html | MIT | 取得して利用。返答に出典を付ける |
| design-system-example-components-react | MIT | 同上 |
| design-tokens（npm `@digital-go-jp/design-tokens` 2.1.0） | MIT | 同上 |
| design.digital.go.jp のガイドライン本文 | サイト上に明記なし。www.digital.go.jp のコピーライトポリシーは PDL1.0（CC BY 4.0 互換）だが、サブドメインに及ぶかは不明 | 同梱しない。利用者の手元で取得してキャッシュする。返答に出典と加工の旨を付ける |
| デジタル庁ロゴ | PDL 対象外、申請が必要 | 使わない |

- robots.txt（https://design.digital.go.jp/dads/robots.txt ）は全ページ許可。
- このリポジトリ自体のコードは MIT ライセンスで公開する。
- README の冒頭に「非公式。デジタル庁とは無関係」と明記する。

### 出典表記

すべてのツール返答の末尾に次の形式で付ける。

```
出典: 「<ページタイトル>」（デジタル庁デザインシステム）<URL> を dads-mcp が取得・整形
取得日: YYYY-MM-DD
```

GitHub 由来のものは `出典: digital-go-jp/<repo>（MIT License）<ファイルの GitHub URL> commit <SHA 先頭7桁>` とする。

### アクセスのマナー

- 同時接続数は 4 まで。User-Agent は `dads-mcp/<version> (+<リポジトリURL>)`。個人情報は入れない。
- GitHub のリポジトリは API ではなく tarball（`https://codeload.github.com/digital-go-jp/<repo>/tar.gz/refs/heads/main`）で 1 リクエストずつ取得し、API のレート制限を避ける。commit SHA は `https://api.github.com/repos/<owner>/<repo>/commits/main`（1 リクエスト）で取る。失敗しても SHA なしで続行する。

### 動作環境

- Node.js 22 以上（2026-11-18 時点でサポート中の LTS である 22・24・26。Node 20 は 2026-04-30 にサポート終了。開発環境は Node 26）
- macOS / Linux / Windows

## 4. データソース（2026-11-18 時点の実測）

### ガイドラインサイト

- 静的 HTML（Astro 製）。本文は `<main>` 内にあり、JavaScript なしで取れる。
- ページ一覧は `https://design.digital.go.jp/dads/sitemap-index.xml` → `sitemap-0.xml`（189 URL）。
  - components: 135 URL。コンポーネント 49 個。サブページは `usage/`（27）、`accessibility/`（8）、`changelog/`（49）、`example/`（1）
  - foundations: 26 URL。color, corner-shapes, elevation, icon, layout, link-text, spacing, typography の 8 項目と、`accessibility/`、`color/color-palette/`、`typography/text-style/` などのサブページ
  - guidance 9、introduction 5、webaccessibility 6、resources 2、その他（search、updates-*）
- 取得対象は changelog、search、updates-* を除く全ページ。

### HTML 版コンポーネント（digital-go-jp/design-system-example-components-html）

- `src/components/<kebab-case>/` に 42 ディレクトリ。
- 各ディレクトリに `<name>.md`（属性の仕様表と使い方。ガイドラインページへのリンクあり）、`<name>.css`、複数の `*.html`（例: button は `playground.html`, `as-link.html` など）。
- `.stories.ts`、`.vrt.js`、`.mdx` は取得対象外。

### React 版コンポーネント（digital-go-jp/design-system-example-components-react）

- `src/components/<PascalCase>/` に 45 ディレクトリ。`<Name>.tsx`、`index.ts`、一部に `component-spec.md` と `.mdx`。
- `.stories.tsx` は対象外。
- React 版は Tailwind と `@digital-go-jp/tailwind-theme-plugin` が前提。返答にその旨を書く。

### デザイントークン（digital-go-jp/design-tokens）

- 基準は npm で公開されている最新版（2026-11-18 時点で 2.1.0）。GitHub の main は使わない。返す値と CDN で読み込まれる CSS を一致させるため（ビルダーチェック後の決定）。
  - バージョンは `https://registry.npmjs.org/@digital-go-jp/design-tokens/latest` の `version` で決める。
  - CSS 変数: npm の tarball 内の `dist/tokens.css`（`--color-primitive-blue-50: #e8f1fe;` 形式）と `dist/tokens-simple.css`。
  - 構造化データ: GitHub のタグ `v<version>` の `figma/tokens.json`（約 25KB）。トップレベルは Color（Primitive / Neutral / Semantic / Key）、Typography（FontWeight, FontFamily, FontSize, LineHeight など）、Size（BorderRadius, Elevation など）。`dist/tokens.js` は実行せず、使わない。
  - 出典表記は `出典: @digital-go-jp/design-tokens v<version>（MIT License）`。
- Web ページで使うときの読み込み方法（npm パッケージ、または CDN の `https://cdn.jsdelivr.net/npm/@digital-go-jp/design-tokens@<version>/dist/tokens.css`）も返答に含める。`<version>` は上で決めたもの。

### 名前の対応

サイトのスラッグ（例 `breadcrumb`）、HTML 版のディレクトリ（kebab-case）、React 版のディレクトリ（PascalCase、例 `Breadcrumbs`）は一致しないことがある。

0. ガイドラインの概要ページにある「各種リソース」表の GitHub リンク（例 `.../design-system-example-components-react/tree/main/src/components/Button`）から対応を取る（計画作成時に確認）
1. リンクがないものは、小文字化し、`-` と末尾の `s` を除いて正規化した名前で自動対応を作る
2. 合わないものは `src/data/name-overrides.json` に手で書く
3. `update` 実行時に、どこにも対応しなかったものを警告として表示する

## 5. 採用した方式と検討した案

| 案 | 内容 | 長所 | 短所 |
| --- | --- | --- | --- |
| 1. スナップショット方式（採用） | `update` で全データを取得して手元に保存し、MCP はそこから返す | 速い。オフラインで動く。サイト構造が変わっても通常利用は壊れない | 最新化に `update` が必要 |
| 2. 都度取得方式 | ツール呼び出しのたびに取得 | 常に最新 | 遅い。ネット必須。サイト構造の変化でその場で壊れる |
| 3. MCP を作らない | clone した repo と保存した Markdown を CLAUDE.md で参照させる | 最も安い | Claude Code 以外で使いにくい。公開して配る形にならない |

ユーザーが案 1 を選んだ。サイトの更新頻度は数週間に一度程度（例: ボタンのページは 2026-10-21 更新）なので、手動の `update` で足りる。

## 6. 設計

### 6.1 全体構成

```
dads-mcp            → MCP サーバー起動（stdio）
dads-mcp update     → スナップショットを取得・更新
dads-mcp status     → スナップショットの取得日、件数、保存場所を表示

（利用者は `npx -y github:darthrommy/dads-mcp [update|status]` で実行する）

[取得] sitemap / GitHub tarball ──> [変換] HTML→Markdown, 名前対応 ──> [保存] キャッシュディレクトリ
[提供] MCP ツール ──> キャッシュから読み出し、出典を付けて返す
```

### 6.2 キャッシュ

- 保存場所: `$XDG_CACHE_HOME/dads-mcp`、なければ macOS / Linux は `~/.cache/dads-mcp`、Windows は `%LOCALAPPDATA%\dads-mcp`。環境変数 `DADS_MCP_CACHE_DIR` で上書きできる。
- 中身:
  - `manifest.json`: スキーマバージョン、取得日時、各 repo の commit SHA、件数、警告
  - `pages/<path>.md`: ガイドラインサイトの各ページ（front matter に title、url、更新日、取得日）
  - `components.json`: コンポーネント一覧と名前対応（サイトのスラッグ、日本語名、概要の 1 文、HTML / React の有無とファイル一覧）
  - `repos/html/...`、`repos/react/...`: 対象ファイルのみ
  - `tokens/tokens.json`、`tokens/tokens.css`
  - `search-index.json`: 検索インデックス
- 更新は一時ディレクトリに全部取得してから入れ替える。途中で失敗したら既存のスナップショットを残す。
- ページ単位の変換失敗は警告として manifest に記録し、残りは続行する。全体の 2 割以上が失敗したら更新を中止して既存を残す。

### 6.3 初回起動

- サーバー起動時にスナップショットがなければ、バックグラウンドで取得を始める。起動自体は待たせない。
- 取得中にツールが呼ばれたら、最大 60 秒待つ。それでも終わらなければ「初回データ取得中。しばらくしてから再実行するか、`npx -y github:darthrommy/dads-mcp update` を実行してください」と返す。
- スナップショットの取得日が 30 日より古ければ、返答の末尾に `npx -y github:darthrommy/dads-mcp update` を勧める一文を付ける。自動更新はしない。

### 6.4 HTML から Markdown への変換

- `<main>` 内だけを対象にし、目次（「このページの目次」）、「各種リソース」の表、前後ページへのナビ、`<style>` / `<script>` を除く。
- 見出し、段落、リスト、表、コード、注意書きは Markdown で保持する。
- 画像は `![alt](絶対URL)` にする。画像ファイル自体は取得しない。
- ページ内リンクは絶対 URL にする。
- タイトルは `<title>` から「｜デジタル庁デザインシステムβ版」を除いたもの。ページ上部の「YYYY年M月D日更新」を更新日として抜く。

### 6.5 MCP ツール

全ツールの返答は Markdown テキストで、末尾に出典（3 章）を付ける。

| ツール | 引数 | 返すもの |
| --- | --- | --- |
| `list_components` | なし | 全コンポーネントの名前（英語スラッグ）、日本語名、概要 1 文、ガイドライン / HTML / React の有無 |
| `get_component` | `name`（スラッグ・日本語名・React 名のどれでも可）、`parts`（省略時 `["overview","usage","accessibility","html"]`。ほかに `"css"`, `"react"`） | 指定部分のガイドライン本文とコード。HTML は `.md` の仕様表と `.html` / `.css` の中身 |
| `list_foundations` | なし | foundations の項目とサブページ一覧 |
| `get_foundation` | `topic`（例 `color`, `typography`）、`subpage`（任意。例 `color-palette`, `text-style`, `accessibility`） | foundations の本文 |
| `get_tokens` | `category`（任意。`color`, `typography`, `radius`, `elevation`。トークンに余白（spacing）は含まれないため、`spacing` を指定されたら `get_foundation` の spacing を案内する）、`format`（`css` / `json`、省略時 `css`） | トークンの名前と値。CSS の読み込み方法（npm / CDN）も付ける |
| `search` | `query`、`limit`（省略時 10） | ヒットしたページのタイトル、URL、該当箇所の抜粋 |
| `get_page` | `path`（例 `guidance/how-to-use` または完全 URL） | 任意のガイドラインページの本文 |

- `name` や `topic` が見つからないときは、近い候補を最大 5 件返す。
- 1 回の返答が長くなりすぎる場合（目安 2 万文字超）は切り詰め、「`parts` を絞って再実行」と書く。
- 検索は日本語に分かち書きがないため、文字 2-gram と英単語でインデックスを作る。

### 6.6 技術選定

- TypeScript、`@modelcontextprotocol/sdk`、stdio トランスポート
- 配布: GitHub から直接（`npx -y github:darthrommy/dads-mcp`）。ビルド成果物はコミットせず、`package.json` の `prepare` スクリプトでインストール時にビルドする。そのため初回起動は遅くなる
- バージョンは Git タグ（`v1.0.0` など）で管理し、固定したい利用者は `github:darthrommy/dads-mcp#v1.0.0` と指定する
- package.json の `name` は `dads-mcp`（npm 上は 2026-11-18 時点で未使用。npm 公開は後で検討）
- テスト: vitest。
  - フィクスチャは、実サイトの HTML 構造（`<main>`、目次、「各種リソース」表、前後ナビ、更新日の表記など）を真似て手で書いた架空のページにする。実ページの本文はリポジトリに入れない（アンチゴールに合わせたビルダーチェック後の決定）。
  - これで変換・名前対応・検索・出典付与をテストする。ネットワークを使う取得は通常テストではモックする。
  - 実サイトに当てる確認は別コマンド（`npm run test:live`）にする。取得結果はリポジトリ外の一時ディレクトリに置き、「全ページの 8 割以上が変換でき、本文が空でない」「主要コンポーネント（button など）のガイドライン・HTML・React が揃う」ことを確かめる。GitHub Actions で週 1 回実行し、サイト構造の変化に気づけるようにする。
- CI: GitHub Actions でビルドとテスト

### 6.7 README に書くこと

- 非公式であること、デジタル庁とは無関係であること
- 各データのライセンスと、取得データを再配布しない設計であること
- Claude Code / Claude Desktop への登録方法
- 使用例（ゼミの Web ページを作る、DADS の色と文字でスライドを作る、など）

## 7. 公開手順（実施時にユーザーに確認する）

- 公開先は `https://github.com/darthrommy/dads-mcp`（ログイン中の gh アカウントから決めた。User-Agent、package.json の repository、README に使う）
- GitHub への public リポジトリ作成と push
- Git タグ（`v1.0.0`）の作成と push
- npm への公開は行わない

どちらも外部に公開する操作なので、実施前にユーザーの確認を取る。

## 8. ビルダーに任せること

- HTML→Markdown 変換ライブラリの選択（turndown など）と、HTML パーサーの選択
- 検索インデックスの具体的な実装とスコアリング
- 名前の自動対応で合わないものの洗い出しと `name-overrides.json` の中身
- `get_tokens` の `category` と tokens.json / tokens.css の対応の細部
- ディレクトリ構成とモジュール分割

## 9. 未決事項

- design.digital.go.jp の本文が PDL1.0 の対象かどうかは未確認。デジタル庁の「ご意見・ご要望」窓口で問い合わせることはできるが、本設計は回答を待たずに進められる形にしてある。
