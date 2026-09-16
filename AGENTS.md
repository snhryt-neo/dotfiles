# プロジェクト作業規約

macOS向けのdotfiles。パッケージ、各ツールの設定、エージェントの共通規約・スキル・MCPを管理する。会話は日本語で行う。

## 変更先

| 対象 | 正本・参照先 |
| :--- | :--- |
| インストール・適用手順 | `Taskfile.yml`、初回セットアップは `README.md` |
| Homebrew・App Storeのパッケージ | `brewfiles/Brewfile`、`brewfiles/Brewfile.mas` |
| dotfilesのリンク | `mise.toml`。設定本体はリンク先ではなくリポジトリ内の各ファイル |
| エージェントへの指示 | このプロジェクトはルートの `AGENTS.md`、全プロジェクト共通は `codex_global/AGENTS.md`。`claude_global/` は独立した既存設定 |
| スキル・MCP | 依存・反映先は `apm/apm.yml`、固定バージョンは `apm/apm.lock.yaml`、自作スキルの編集元は `skills/` |
| X検索MCPサーバー | `tools/xai-search-mcp/README.md` と同ディレクトリの `package.json` |
| キーボード設定 | `keyboards/nuphy-air60-v2/README.md`。設定の正本は同ディレクトリ直下、submodule内はビルド用コピー |

## 適用時の注意

- `task link` は通常のチェックアウトから実行する。リンク先が一時的な作業場所になるのを防ぐため、linked worktreeでは実行できない。
- `task skills` は `~/.apm/apm.yml` を読む。作業中のワークツリーの宣言を読むとは限らないため、実行前にリンク先を確認する。
- 自作スキルもGitHub経由でインストールされる。ローカル編集の配布はmainへのマージ後に `task skills-update` で行い、更新されたロックファイルを差分に含める。
- `~/.codex/config.toml` はアプリが実行時に更新するため、dotfilesのリンク対象に含めない。
- 共通の配布処理のコメントには対象ツールを列挙せず、`apm/apm.yml` の `targets` を参照する。ツール固有の挙動を説明する場合は名前を明記する。

## 検証

コミット前に、変更したファイルを明示して `pre-commit run --files <file...>` を通す。追加の検証は変更対象に合わせて選ぶ。

| 変更対象 | 検証 |
| :--- | :--- |
| zshスクリプト・`.zshrc` | `zsh -n <file>` |
| `Taskfile.yml` | `task --list-all` で読み込みを確認し、変更したタスクの動作を検証 |
| dotfilesのリンク | `mise dotfiles diff` で適用内容を確認。適用後は `mise dotfiles status --missing` で確認 |
| X検索MCPサーバー | `tools/xai-search-mcp` で `npm ci --ignore-scripts`、`npm run check` |
| キーボード設定 | 対象のREADMEにあるビルド手順 |

- `task setup-all`、`task brew`、`task nonbrew`、`task link`、`task skills` は実環境を変更する操作。構文チェックの代わりに実行しない。
- インストール検証の対象と条件は `.github/workflows/actions.yml` を参照する。`task github` をCIに含めていないのは意図的な構成。
- スキルの発火評価を行う場合は、一時プロジェクトの `.agents/skills/<name>/SKILL.md` に評価対象を配置する。読み込まれた設定・スキルを確認し、ユーザースコープの既存スキルが混在した結果を評価に使わない。評価後は一時ファイルを削除する。

## Git・PR

- 新規作業は最新のmainからfeatureブランチまたはワークツリーを作成する。
- コミットメッセージとPRタイトルはConventional Commits形式。コミットメッセージとPR本文は日本語で書く。
- マージはSquashのみ。ワークツリーの削除時は `git branch --merged` で判定せず、対応PRのマージ済み状態と未コミット変更がないことを確認する。
