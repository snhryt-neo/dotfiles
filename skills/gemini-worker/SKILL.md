---
name: gemini-worker
description: >-
  Codexが作成した範囲の明確な作業指示を、Vertex AI Geminiワーカーへ委譲する。
  Issueや実装計画から作業を分解し、gemini-worker CLIの入力を作り、結果と差分をレビューするときに使う。
---

# Gemini worker

`gemini-worker`はCodexが事前に確定した作業指示をGemini 3.8 Flashへ渡すための薄いCLIである。Codexが計画、作業分解、worktreeの割り当て、最終レビューを担当し、Geminiは指定範囲のファイル操作と検証だけを行う。

## Workflow

1. リポジトリの`AGENTS.md`と対象コードを読んで、変更目的と完了条件を確定する。
2. ワーカーに渡す`workspace`、`read_paths`、`write_paths`、`commands`、`required_checks`を具体的に列挙する。
3. 並列作業ではワーカーごとに専用worktreeを割り当て、同じworktreeへ同時に書き込まない。
4. `request-example.json`を参考に一時作業指示書を作り、`gemini-worker run`を実行する。
5. 終了コード、結果JSON、実際のGit差分、必須検証の出力を確認する。
6. Geminiの`completed`だけで完了扱いにせず、Codexがレビューしてから統合する。

## Request rules

- 作業指示には、目的、変更対象、完了条件、禁止事項を具体的に書く。
- `write_paths`は必要なファイルまたはディレクトリだけに絞る。
- `commands`はargv配列で宣言し、GeminiにはコマンドIDだけを渡す。
- ファイル更新前に`read_file`を呼び、返されたsha256を`expected_sha256`に指定させる。
- Web FetchやWeb Searchはワーカーに提供していない。外部情報を要する場合は、Codex側で先に検索・取得し、必要な事実、出典URL、適用条件を機密情報なしで`context`または作業指示へ記載してからワーカーへ渡す。Geminiに外部調査を依頼しない。
- ユーザーの認証情報、ADCファイル、APIキーを`context`や作業指示書に含めない。
- 認証・権限不足で停止した場合は、迂回せず利用者側に必要な準備を報告する。

## Local installation

リポジトリのルートで次を実行する。

```bash
task gemini-worker-install
```

ADCを使うため、実行前に`GOOGLE_CLOUD_PROJECT`、`GOOGLE_CLOUD_LOCATION`、`GOOGLE_GENAI_USE_VERTEXAI=true`を設定する。サービスアカウント鍵やGemini APIキーはCLIへ渡さない。
