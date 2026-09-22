# gemini-worker

Codexが作成した作業指示を、Vertex AIのGemini 3.8 Flashへ委譲するためのCLIです。ワーカーは作業指示書で許可されたファイルと検証コマンドだけを扱い、計画・並列実行・最終レビューはCodex側で行います。

## Prerequisites

- 課金が有効なGoogle Cloudプロジェクト
- Gemini Enterprise Agent Platform API（旧Vertex AI API）
- 呼び出し対象プロジェクトに対するGemini Enterprise Agent Platform User（`roles/aiplatform.user`）相当の権限
- quota projectを利用する場合の`serviceusage.services.use`権限
- `uv`とGoogle Cloud CLI

## Setup

ローカル開発ではサービスアカウント鍵やGemini APIキーを使わず、ユーザーアカウントのApplication Default Credentials（ADC）を使います。

```bash
gcloud auth application-default login
gcloud auth application-default set-quota-project YOUR_PROJECT_ID
task gemini-worker-install
```

ワーカーを実行するシェルで、Vertex AIとプロジェクトを明示します。

```bash
export GOOGLE_CLOUD_PROJECT="YOUR_PROJECT_ID"
export GOOGLE_CLOUD_LOCATION="global"
export GOOGLE_GENAI_USE_VERTEXAI="true"
```

`task gemini-worker-install`を使わず、このディレクトリで直接導入することもできます。

```bash
uv tool install --force .
```

## Usage

作業指示書の例は[`skills/gemini-worker/references/request-example.json`](../../skills/gemini-worker/references/request-example.json)にあります。Codex側で作業範囲、書き込み対象、許可コマンド、必須検証を確定してから実行します。

```bash
gemini-worker run --request /absolute/path/request.json
```

標準出力には結果JSONを1件だけ出力します。`status`が`completed`でも、実際の差分と検証結果をCodex側で確認します。`task gemini-worker-test`でVertex AIへ接続しないテストを実行できます。

ワーカーはVertex AIの`gemini-3.8-flash`を`HIGH`に固定します。APIキー環境変数が設定されている場合は起動時に拒否し、ADCが見つからない場合もエラーとして返します。サービスアカウント鍵を使う場合は、鍵をリポジトリや作業指示書へ置かず、Google Cloudの公式ガイドに従って別途管理してください。

## Request contract

入力JSONには、作業範囲と検証条件を明示します。

| 項目 | 内容 |
| :--- | :--- |
| `workspace` | 作業対象worktreeの絶対パス |
| `read_paths` | 読み取りを許可するファイルまたはディレクトリ |
| `write_paths` | 作成・更新・削除を許可するファイルまたはディレクトリ |
| `commands` | `check_id`から実行するargv配列の対応表 |
| `required_checks` | `completed`前に必ず実行する検証ID |
| `limits` | ツール呼び出し、時間、出力サイズの上限 |

ファイル更新では、先に`read_file`で取得したsha256を`expected_sha256`へ指定します。コマンドは文字列を直接渡さず、入力JSONで宣言したIDだけを`run_check`へ渡します。

## Development

```bash
uv run --locked pytest
uv build --out-dir /tmp/gemini-worker-dist
```

実装とテストは[`src/gemini_worker`](src/gemini_worker)と[`tests`](tests)にあります。ADC、APIキー、作業指示書に含める認証情報はテストへ持ち込まないでください。
