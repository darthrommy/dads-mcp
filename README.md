# dads-mcp

An unofficial MCP server for the [Digital Agency Design System (DADS)](https://design.digital.go.jp/dads/) of Japan. It lets AI assistants read DADS guidelines, component code (HTML / React) and design tokens. Not affiliated with the Digital Agency. Guideline text is not bundled in this repository; it is fetched into a local cache on your machine, and every answer includes the source URL.

---

デジタル庁デザインシステム（DADS）のガイドライン・コンポーネントのコード・デザイントークンを、AI（Claude Code、Claude Desktop など MCP に対応したアプリ）から引けるようにする MCP サーバーです。

非公式です。デジタル庁とは無関係です。

## できること

| ツール | 内容 |
| --- | --- |
| `list_components` | コンポーネントの一覧 |
| `get_component` | 1 つのコンポーネントの説明（概要・使い方・アクセシビリティ）と HTML / CSS / JavaScript / React のコード、作例が読み込むファイルの一覧、CSS から抜き出した属性とクラスの一覧（`parts: ["spec"]`）。HTML は代表の作例 1 つを返し、ほかの作例は `example` で 1 つずつ取れる |
| `get_setup` | HTML 版を使うための共通の土台。フォント・tokens.css・global.css の読み込み順、global.css と tokens.css の変数の違い、global.css の本文 |
| `list_foundations` | 基本ルール（色・文字・余白・レイアウトなど）の項目一覧 |
| `get_foundation` | 基本ルールの本文 |
| `get_tokens` | デザイントークン（色・文字・角丸・影）の CSS 変数か JSON と、読み込み方法 |
| `search` | ガイドラインと、HTML 版・React 版のドキュメント（.md）のキーワード検索 |
| `get_page` | 上以外の任意のページの本文 |

## 使い方

Node.js 22 以上が必要です。

Claude Code:

```sh
claude mcp add --scope user dads -- npx -y --allow-git=root github:darthrommy/dads-mcp
```

`--scope user` を付けると、すべてのプロジェクトで使えるようになります。付けない場合は、コマンドを実行したプロジェクトだけで使えます。

`--allow-git=root` は npm 12 以上で必要です。npm 12 から GitHub などの git からの取得が既定で禁止になり、付けないと `EALLOWGIT` で取得に失敗してサーバーが起動しません。npm 11 以下では使われない設定として警告が出るだけで、そのまま動きます。

Claude Desktop（`claude_desktop_config.json`）:

```json
{
  "mcpServers": {
    "dads": { "command": "npx", "args": ["-y", "--allow-git=root", "github:darthrommy/dads-mcp"] }
  }
}
```

初回は、インストール時のビルドと、デジタル庁のサイト・GitHub からのデータ取得に時間がかかります。データは次の場所に保存されます。

- macOS / Linux: `~/.cache/dads-mcp`（`XDG_CACHE_HOME` があればその下）
- Windows: `%LOCALAPPDATA%\dads-mcp`
- 環境変数 `DADS_MCP_CACHE_DIR` で変更できます

### データの更新と確認

```sh
npx -y --allow-git=root github:darthrommy/dads-mcp update   # 最新のデータを取得
npx -y --allow-git=root github:darthrommy/dads-mcp status   # 保存場所・取得日時・件数を表示
```

自動では更新しません。取得から 30 日たつと、ツールの返答に更新を勧める一文が付きます。

返答は 1 回 20000 文字までです。収まらないファイルは省き、返答の末尾に、それを取る呼び出し方とキャッシュ内の場所を書きます。1 つのファイルだけで収まらないときは行の境目で切り、続きを取る呼び出し方（`from_line`）を書きます。

### 頼み方の例

- 「DADS のコンポーネントを使って、ゼミの紹介ページを HTML で作って」
- 「DADS の色と文字のトークンで、発表スライドの配色とフォントを決めて」
- 「DADS のボタンのアクセシビリティの注意点を教えて」

## ライセンス

このリポジトリのコードは [MIT License](./LICENSE) です。

このツールが取得するデータは次のとおりです。

| データ | 提供元 | ライセンス |
| --- | --- | --- |
| HTML 版コンポーネント | [digital-go-jp/design-system-example-components-html](https://github.com/digital-go-jp/design-system-example-components-html) | MIT |
| React 版コンポーネント | [digital-go-jp/design-system-example-components-react](https://github.com/digital-go-jp/design-system-example-components-react) | MIT |
| デザイントークン | [@digital-go-jp/design-tokens](https://github.com/digital-go-jp/design-tokens) | MIT |
| ガイドライン本文 | [デジタル庁デザインシステムβ版](https://design.digital.go.jp/dads/) | サイト上に明記なし |

- ガイドライン本文はこのリポジトリに含めず、使う人の手元で取得してキャッシュします。
- ツールの返答には毎回、出典（元のページや GitHub のファイルの URL）と取得日が付きます。ガイドライン本文は HTML から抜き出して整形したものです。
- デジタル庁のロゴは使っていません。
