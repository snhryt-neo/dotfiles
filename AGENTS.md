# AGENTS.md

このファイルは、このリポジトリで作業するCodex向けの指示を定義する。

## 概要
Mac環境を想定したパッケージ管理 (via Homebrew) やGitのグローバル設定、`.zshrc` の管理、Codexのユーザースコープの作業規約とエージェントスキルなどを統合管理するためのリポジトリ。

## 主な技術
- **タスク管理**: `Taskfile.yml` がmiseによるdotfiles適用と各シェルスクリプト(`init.sh`, `github.sh`, `gui.sh`, `nonbrew.sh`)を順次実行
- **Homebrew**: `brewfiles/Brewfile`(CLIツール・cask)と `brewfiles/Brewfile.mas`(App Store)で宣言的管理
- **mise**: グローバルで利用する python, node などのバージョンと、`mise.toml` でdotfilesを宣言的に管理
- **APM**: エージェントスキルを自作・外部を問わず `apm/apm.yml` で宣言的に管理（コミットSHAは `apm/apm.lock.yaml` で固定）
- **CI**: GitHub Actions (`.github/workflows/actions.yml`) がPR時にmacOSランナーでセットアップをテスト

## よく使うコマンド
```bash
task brew           # Homebrew パッケージをインストール/更新
task brew-mas       # Mac App Store アプリをインストール/更新
task nonbrew        # Homebrew 以外 (node, uv) のパッケージをインストール
task link           # シンボリックリンクを作成
task skills         # apm.yml からエージェントスキルをインストール
task skills-update  # インストール済みスキルをアップデート
```

## スキルの評価

スキルの評価は、通常のユーザースコープのスキルや設定が混在しない一時プロジェクトで実行する。

- 評価対象は一時プロジェクトの `.agents/skills/<name>/SKILL.md` へ配置する
- 評価ごとに一時ディレクトリを明示的に作成し、通常利用するグローバル設定とスキルを変更しない
- 実行時に読み込まれたスキルと設定を確認し、評価対象以外が混在した結果を発火精度の評価に使わない
- 評価用ファイルは終了時に削除し、`~/.agents/skills` へ一時ファイルを残さない

## ワークツリーの管理

Codexのワークツリーは `~/.codex/worktrees/<hash>/<リポジトリ名>` に作成される。
マージ済みのものは定期的に削除する。

> Squashマージのみを使用しているため `git branch --merged` では検出できない。
> リモートブランチが削除されていることに加え、対応するPRがマージ済みであることを確認する。

```bash
# マージ済みPRのブランチとワークツリーを特定するため、リモートの状態を更新する。
git fetch --prune origin
git worktree list
git branch -vv

# 未コミット変更がある場合は削除を止め、内容を確認する。
git worktree remove <worktree-path>
git branch -D <merged-branch>
```

## Git関連
- diffが出ているファイルについてはpre-commitがパスするまでcommitしてはいけない
- GitHub Flow. 必ず最新のmainからfeatureブランチ、もしくはワークツリーを切って作業を進める
- PRのタイトルとコミットメッセージのプレフィクスはConventional Commits形式に沿う
- PRの本分やコミットメッセージは日本語
- Squashマージのみ

## 注意
- 必ず日本語で会話すること
- `task github` をCIに入れていないのは意図的にそうしている
