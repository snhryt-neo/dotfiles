# xAI X Search Remote MCP

## Overview

- 個人用のX検索専用Remote MCP
- Cloudflare WorkersにデプロイしてGitHub OAuth Appで認証
  - Workers KV: OAuthのclient、grant、tokenの保存
  - Durable Object: 一時的なcallback stateの保存
- X検索は[xAI Responses APIのX Search tool](https://docs.x.ai/developers/tools/x-search)を使う
- クライアント側はAPMでRemote MCPを設定する: [`apm.yml`](../../apm/apm.yml)

## Setup

Cloudflare、GitHub、xAIのリソースを失った場合でも再構築できる手順。

### 1. xAI API keyを発行する

[xAI Console](https://console.x.ai/)でAPI keyを発行する。課金事故を防ぐため、auto top-upを無効にし、invoiced billing limitを`$0`にする。[xAI Billing](https://docs.x.ai/console/billing)

### 2. Cloudflareへログインする

```bash
cd tools/xai-search-mcp
npm ci --ignore-scripts
npx wrangler login
npx wrangler whoami --json
```

`whoami`の出力でデプロイ先のCloudflare accountを確認する。Cloudflare DashboardのWorkers & Pagesで`workers.dev` subdomainを確認し、次の公開URLを決める。

```text
https://xai-search-mcp.<workers.dev subdomain>.workers.dev
```

### 3. GitHub OAuth Appを作成する

[GitHub Developer settings](https://github.com/settings/applications/new)で、このMCP専用のOAuth Appを作成する。

| 設定 | 値 |
| :--- | :--- |
| Application name | `Personal xAI X Search MCP` |
| Homepage URL | `<公開URL>` |
| Authorization callback URL | `<公開URL>/callback` |

作成後にClient Secretを生成する。Client IDと数値user IDは後で`wrangler.jsonc`へ設定する。

```bash
gh api user --jq .id
```

### 4. Workers KV namespaceを作成する

```bash
npx wrangler kv namespace create OAUTH_KV
```

出力されたnamespace IDを控える。Durable Objectは`wrangler.jsonc`のmigrationにより初回デプロイ時に作成されるため、事前操作は不要。

### 5. `wrangler.jsonc`を設定する

取得した値を`wrangler.jsonc`へ設定する。

```jsonc
{
  "vars": {
    "PUBLIC_ORIGIN": "<公開URL>",
    "GITHUB_CLIENT_ID": "<GitHub OAuth AppのClient ID>",
    "ALLOWED_GITHUB_USER_ID": "<GitHubの数値user ID>"
  },
  "kv_namespaces": [
    {
      "binding": "OAUTH_KV",
      "id": "<KV namespace ID>"
    }
  ]
}
```

`PUBLIC_ORIGIN`、Client ID、数値user ID、KV namespace IDは公開設定。API keyとClient Secretはここへ書かない。

### 6. Secretを登録する

```bash
npx wrangler secret put XAI_API_KEY
npx wrangler secret put GITHUB_CLIENT_SECRET
```

入力値はCloudflare Worker Secretへ保存され、リポジトリには残らない。

### 7. デプロイして確認する

```bash
npm run check
npm run deploy
curl --fail --silent --show-error "<公開URL>/health"
```

GitHub OAuth AppのHomepage URLとcallback URLが、デプロイ後のURLと完全に一致することを確認する。

## Usage

ローカル開発では`.dev.vars.example`を`.dev.vars`へコピーし、2つのSecretを設定する。`.dev.vars`はgitignoreされる。

```bash
cd tools/xai-search-mcp
npm ci --ignore-scripts
cp .dev.vars.example .dev.vars
npm run dev
```

変更後はテスト、依存監査、デプロイを実行する。

```bash
npm run check
npm audit
npm run deploy
```

ヘルスチェック:

```bash
curl --fail --silent --show-error \
  https://xai-search-mcp.snhryt.workers.dev/health
```

## Architecture

```mermaid
flowchart LR
    Client[Codex / Claude Code] -->|OAuth + MCP| Worker[Cloudflare Worker]
    Worker -->|grant / token| KV[(Workers KV)]
    Worker -->|one-time auth state| Flow[OAuthFlowStore DO]
    Worker -->|reserve quota| Budget[BudgetGuard DO]
    Worker -->|x_search| xAI[xAI Responses API]
    Worker -->|identity check| GitHub[GitHub OAuth]
```

### Authentication

MCPエンドポイント自体は公開されているため、GitHub OAuthで本人確認し、取得した数値user IDが`ALLOWED_GITHUB_USER_ID`と一致した場合だけMCPトークンを発行する。GitHubへ追加scopeは要求せず、本人確認後のaccess tokenは保存せず失効させる。

OAuth Providerが管理するclient、grant、tokenはWorkers KVへ保存する。一度だけ消費すべき同意flowとGitHub callback stateは、結果整合のKVではなく`OAuthFlowStore` Durable Objectへ保存する。

### Cost control

xAIを呼ぶ前に`BudgetGuard` Durable Objectで利用枠を予約する。上限は1ユーザーあたり5回/分、30回/UTC日。並行リクエストでも上限を越えないことを優先するため、xAI側のエラー時も予約済みの枠は戻さない。

xAIリクエストは`grok-4.3`、reasoning `none`、X検索1回、出力1,200トークンに固定する。クライアントからモデル、ツール、回数、出力量は変更できない。

### Data handling

`XAI_API_KEY`と`GITHUB_CLIENT_SECRET`はWorker Secretだけに保存する。検索語、Authorization、API key、xAIのエラー本文はログへ出さず、Workers Observabilityも無効にする。

xAIには検索語が送信され、既定ではAPIの入出力が監査目的で30日保持される。ZDRを確認できない間は、機密情報を検索語へ含めない。[xAI API Security FAQ](https://docs.x.ai/developers/faq/security)

## ADR

### Cloudflare WorkersでRemote MCPを運用する

- その他の検討パターン
  - ローカルでstdio MCPを動かし、CodexとClaude Codeへ個別設定する
  - 第三者が公開するRemote MCPへxAI API keyを渡す
  - VPSやCloud RunでRemote MCPを運用する
- 意思決定した理由
  - CodexとClaude Codeへ同じURLをAPMで配布できる
  - xAI API keyを自分のCloudflareアカウント内で管理できる
  - 常時起動サーバーなしで、OAuth、KV、Durable Objectsを同じ基盤へまとめられる

### GitHub OAuthで利用者を限定する

- その他の検討パターン
  - 固定Bearer tokenを各MCPクライアントへ設定する
  - Cloudflare AccessでWorker全体を保護する
  - GitHubのlogin名をallowlistと照合する
- 意思決定した理由
  - CodexとClaude Codeの標準OAuthフローをそのまま利用できる
  - 固定tokenをAPMやクライアント設定へ配布せずに済む
  - 変更可能なlogin名ではなく数値user IDで、単一利用者を安定して識別できる

### 一時状態と課金枠にDurable Objectsを使う

- その他の検討パターン
  - OAuth Providerの永続データ、一時state、課金枠をすべてWorkers KVへ保存する
  - すべての状態を単一のDurable Objectへ保存する
  - D1や外部データベースで状態を管理する
- 意思決定した理由
  - OAuth Providerが前提とするclient、grant、tokenの保存にはKVをそのまま使える
  - 一度だけ消費するstateと並行更新される課金枠には、Durable Objectsの強整合性とtransactionが必要になる
  - 一時状態と課金枠を責務別に分け、不要な外部データベースを増やさずに済む

### xAIの機能と費用をサーバー側で固定する

- その他の検討パターン
  - モデル、reasoning、ツール回数、出力量をMCPの入力で変更可能にする
  - Web検索や画像・動画理解も同じMCPで提供する
  - X APIを直接呼び出して検索結果を組み立てる
- 意思決定した理由
  - 購入済みの少額クレジット内で費用を予測しやすくする
  - MCPの用途をX検索へ限定し、クライアント入力による機能拡張と課金増加を防ぐ
  - xAIのX Search toolによる検索と引用生成を使い、独自の検索・要約処理を持たずに済む

## Note

- 回数上限とxAIの固定値は`src/config.ts`で変更する
- 通常の`npm run deploy`では登録済みのWorker Secretは維持される
- `npx wrangler secret put <NAME>`はSecret更新と同時に新しいWorker versionをデプロイする
- OAuth同意stateは10分で失効する。期限切れ時はクライアントからOAuth認証をやり直す

参考資料: [xAI X Search](https://docs.x.ai/developers/tools/x-search)、[xAI Pricing](https://docs.x.ai/developers/pricing)、[Cloudflare Workers OAuth Provider](https://github.com/cloudflare/workers-oauth-provider)、[Cloudflare MCP security guide](https://developers.cloudflare.com/agents/model-context-protocol/guides/securing-mcp-server/)
