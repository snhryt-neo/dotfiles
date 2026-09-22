# gemini-worker

## Overview

Codexが作成した作業指示をVertex AIのGemini 3.8 Flashへ委譲するCLI。ワーカーは作業指示書で許可されたファイルと検証コマンドだけを扱い、計画・並列実行・最終レビューはCodex側で行う。

## Prerequisites

- 課金が有効なGoogle Cloudプロジェクト
- Gemini Enterprise Agent Platform API（旧Vertex AI API）
- 呼び出し対象プロジェクトに対するGemini Enterprise Agent Platform User（`roles/aiplatform.user`）相当の権限
- quota projectを利用する場合の`serviceusage.services.use`権限
- `uv`とGoogle Cloud CLI

## Setup

ローカル開発ではサービスアカウント鍵やGemini APIキーを使わず、ユーザーアカウントのApplication Default Credentials（ADC）を使う。

```bash
gcloud auth application-default login
gcloud auth application-default set-quota-project YOUR_PROJECT_ID
task gemini-worker-install
```

ワーカーを実行するシェルで、Vertex AIとプロジェクトを明示する。

```bash
export GOOGLE_CLOUD_PROJECT="YOUR_PROJECT_ID"
export GOOGLE_CLOUD_LOCATION="global"
export GOOGLE_GENAI_USE_VERTEXAI="true"
```

`task gemini-worker-install`を使わず、このディレクトリで直接導入することもできる。

```bash
uv tool install --force .
```

## Usage

### Run

作業指示書の例は[`skills/gemini-worker/references/request-example.json`](../../skills/gemini-worker/references/request-example.json)にある。Codex側で作業範囲、書き込み対象、許可コマンド、必須検証を確定してから実行する。

```bash
gemini-worker run --request /absolute/path/request.json
```

標準出力には結果JSONを1件だけ出力する。`status`が`completed`でも、実際の差分と検証結果をCodex側で確認する。

### Test

Vertex AIへ接続しないテストを実行する。

```bash
task gemini-worker-test
```

直接実行する場合は次のコマンドを使う。

```bash
uv run --locked pytest
uv build --out-dir /tmp/gemini-worker-dist
```

## Architecture

### Components

- `src/gemini_worker/cli.py`: CLI引数の解析、環境変数の検証、結果JSONの出力
- `src/gemini_worker/client.py`: Vertex AI Geminiクライアントの生成とモデル設定
- `src/gemini_worker/policy.py`: パス、シンボリックリンク、`.git`、コマンドIDの検証
- `src/gemini_worker/tools.py`: 読み取り、更新、検証コマンド実行のツール実装
- `src/gemini_worker/runner.py`: Geminiとの手動function-callingループと実行制限
- `src/gemini_worker/schemas.py`: 作業指示書、ツール引数、結果のスキーマ

### Request contract

入力JSONには、作業範囲と検証条件を明示する。

| 項目 | 内容 |
| :--- | :--- |
| `workspace` | 作業対象worktreeの絶対パス |
| `read_paths` | 読み取りを許可するファイルまたはディレクトリ |
| `write_paths` | 作成・更新・削除を許可するファイルまたはディレクトリ |
| `commands` | `check_id`から実行するargv配列の対応表 |
| `required_checks` | `completed`前に必ず実行する検証ID |
| `limits` | ツール呼び出し、時間、出力サイズの上限 |

ファイル更新では、先に`read_file`で取得したsha256を`expected_sha256`へ指定する。コマンドは文字列を直接渡さず、入力JSONで宣言したIDだけを`run_check`へ渡す。

### Execution flow

1. CLIが入力JSONとVertex AI用の環境変数を検証する。
2. Geminiへ作業指示と利用可能なツールを渡す。
3. Geminiのfunction callをポリシー検証後に実行する。
4. 必須検証をすべて実行し、結果JSONを標準出力へ1件だけ出力する。

## ADR

### Vertex AIとADCを採用する

Google Cloudプロジェクトの課金、IAM、監査ログを利用するため、Vertex AI経由のGemini呼び出しを採用する。認証はローカル開発で扱いやすく、サービスアカウント鍵をファイルとして配布せずに済むADCを標準とする。

### 薄いCLIとして実装する

計画、並列実行、最終レビューはCodex側が担うため、ワーカーは1つの作業指示を受けて制限付きツールを実行する責務に絞る。これにより、書き込み範囲と検証条件を作業指示書で明示できる。

## Note

- ワーカーはVertex AIの`gemini-3.8-flash`を`HIGH`に固定する。
- APIキー環境変数が設定されている場合は起動時に拒否する。
- ADCが見つからない場合はエラーを返す。
- サービスアカウント鍵を使う場合は、鍵をリポジトリや作業指示書へ置かず、Google Cloudの公式ガイドに従って別途管理する。
- ADC、APIキー、作業指示書に含める認証情報はテストへ持ち込まない。
