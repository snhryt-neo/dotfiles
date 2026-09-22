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

`~/.config/gcloud/application_default_credentials.json` のユーザーADCを読み、`quota_project_id` を呼び出し先プロジェクトにも使う。認証も同じファイルの情報を使い、ロケーションは `global`、Vertex AIの利用はCLI内で固定する。独自の設定ファイルや環境変数の設定は不要。

`GOOGLE_CLOUD_PROJECT`、`GOOGLE_CLOUD_LOCATION`、`GOOGLE_GENAI_USE_VERTEXAI`、`GOOGLE_APPLICATION_CREDENTIALS` による上書きは行わない。

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

## ADR

### Vertex AIとADCによる認証を採用する

#### その他の検討パターン

| パターン | 採用 | GCP IAM・監査 | ローカルの認証運用 | 鍵管理の負担 |
| :--- | :---: | :---: | :---: | :---: |
| Vertex AI + ADC | ✅ | ◎ | ◎ | ◎ |
| Gemini API + APIキー | | △ | ○ | △ |
| Vertex AI + サービスアカウント鍵 | | ◎ | △ | × |

#### 意思決定した理由

Google Cloudプロジェクトの課金、IAM、監査ログを利用できることを重視し、Vertex AIを採用する。認証はユーザーアカウントのADCを標準とする。ローカル開発で扱いやすく、サービスアカウント鍵をファイルとして配布・保管する負担を避けられるためである。ADCには実行環境ごとの認証設定が必要になる欠点があるが、鍵漏えいのリスクと運用負担を抑えられる利点が上回る。

### ワーカーを薄いCLIとして実装する

#### その他の検討パターン

| パターン | 採用 | 実行範囲の制御 | 実装・検証の責務分離 | 拡張の自由度 |
| :--- | :---: | :---: | :---: | :---: |
| 作業指示を受ける薄いCLI | ✅ | ◎ | ◎ | ○ |
| ワーカー内で計画からレビューまで行う自律エージェント | | △ | △ | ◎ |
| 制限のない汎用シェル実行器 | | × | × | ◎ |

#### 意思決定した理由

計画、並列実行、最終レビューはCodex側が担うため、ワーカーは1つの作業指示を受けて制限付きツールを実行する責務に絞る。書き込み範囲と検証条件を作業指示書で明示でき、実行範囲を制御しやすいことを重視した。自律エージェントより拡張の自由度は下がるが、責務を分離して検証可能性を保つ利点が上回る。汎用シェル実行器は実行範囲を制限しにくいため採用しない。

## Note

- ワーカーはVertex AIの`gemini-3.8-flash`を`HIGH`に固定する。
- APIキー環境変数が設定されている場合は起動時に拒否する。
- ユーザーADCを読み込めない場合、または `quota_project_id` が未設定の場合はエラーを返す。
- 認証元は上記パスのユーザーADCに固定し、サービスアカウント鍵は使わない。
- ADC、APIキー、作業指示書に含める認証情報はテストへ持ち込まない。
