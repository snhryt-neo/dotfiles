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
4. 委譲前に、指定した検証コマンドをワーカーと同じ作業ディレクトリ・環境変数・実行権限で実行し、依存関係やキャッシュへのアクセスを含めて検証が起動できることを確認する。Codex側だけ権限を拡張して成功した結果を、ワーカーの実行可否の根拠にしない。
5. [request-example.json](references/request-example.json)を参考に一時作業指示書を作り、`gemini-worker run`を実行する。
6. 終了コード、結果JSON、実際のGit差分、必須検証の出力を確認する。
7. Geminiの`completed`だけで完了扱いにせず、Codexがレビューしてから統合する。

## Request rules

- 作業指示には、目的、変更対象、完了条件、禁止事項を具体的に書く。
- `write_paths`は必要なファイルまたはディレクトリだけに絞る。
- `commands`はargv配列で宣言し、GeminiにはコマンドIDだけを渡す。
- 認証・権限・サンドボックスによるアクセスエラーが発生したら、同じ条件で再試行せず、`finish(status="blocked")`で失敗したコマンドID、エラー、未実施の検証を直ちに報告するよう作業指示へ明記する。再開はCodex側で原因を解消し、実行条件を確認してから行う。
- ファイル更新前に`read_file`を呼び、返されたsha256を`expected_sha256`に指定させる。
- Web FetchやWeb Searchはワーカーに提供していない。外部情報を要する場合は、Codex側で先に検索・取得し、必要な事実、出典URL、適用条件を機密情報なしで`context`または作業指示へ記載してからワーカーへ渡す。Geminiに外部調査を依頼しない。
- ユーザーの認証情報、ADCファイル、APIキーを`context`や作業指示書に含めない。
- 認証・権限不足で停止した場合は、迂回せず利用者側に必要な準備を報告する。

## Local installation

リポジトリのルートで次を実行する。

```bash
task gemini-worker-install
```

`~/.config/gcloud/application_default_credentials.json`のユーザーADCで認証し、同ファイルの`quota_project_id`を呼び出し先プロジェクトにも使う。ロケーションは`global`、Vertex AIの利用はCLI内で固定するため、環境変数や独自の設定ファイルは不要。ADCまたはquota projectが未設定ならGoogle Cloud CLIで設定し、認証情報を作業指示へ転記しない。サービスアカウント鍵やGemini APIキーはCLIへ渡さない。
