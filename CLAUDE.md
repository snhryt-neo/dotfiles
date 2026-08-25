# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 概要
Mac環境を想定したパッケージ管理 (via Homebrew) やGitのグローバル設定、`.zshrc` の管理、Claude Codeのユーザースコープの設定とエージェントスキルなどを統合管理するためのリポジトリ。

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

スキルの発火evalは、APMがインストールした`~/.claude/skills`の影響を受けない一時プロジェクトで実行する。

- 評価対象は一時プロジェクトの`.claude/skills/<name>/SKILL.md`へ配置する。旧形式の`.claude/commands`は使わない
- 上位ディレクトリの`~/.claude`をプロジェクト設定として検出しない。評価ごとに一時ディレクトリを明示的に作成する
- Claude CLIは`--setting-sources project`で起動し、ユーザースコープの既存スキルを評価対象へ混在させない
- descriptionの発火精度を測る場合は利用可能なツールを`Skill`に限定し、他ツールへ直接進んだ結果を未発火として扱わない
- 評価用スキルは終了時に削除し、`~/.claude/skills`へ一時ファイルを残さない

## ワークツリーの管理

ワークツリーの作成先はツールによって異なる。

| ツール | 作成先 |
| :--- | :--- |
| Claude Code | `.claude/worktrees/<name>`（リポジトリ内部） |
| Codex | `~/.codex/worktrees/<hash>/<リポジトリ名>`（リポジトリ外部） |

以下は `claude agents` コマンドでサブエージェントを起動して作成されたワークツリーの手順。
マージ済みのものは定期的に削除する。

> Squashマージのみを使用しているため `git branch --merged` では検出できない。
> リモートブランチが削除されている（PR マージ後に自動削除）かどうかをマージ済みの判断基準とする。

```bash
# リモートで削除済みのブランチを確認（マージ済みの目印）
git fetch --prune origin

# ワークツリーを削除
git worktree remove --force .claude/worktrees/<name>

# ローカルブランチを削除
git branch -D worktree-<name>
```

一括削除する場合:
```bash
git worktree list  # 残っているワークツリーを確認
# リモート削除済み (origin/worktree-* が [deleted]) のものをまとめて削除
for wt in <name1> <name2>; do
  git worktree remove --force ".claude/worktrees/$wt"
  git branch -D "worktree-$wt"
done
```

## Git関連
- diffが出ているファイルについてはpre-commitがパスするまでcommitしてはいけない
- GitHub Flow. 必ず最新のmainからfeatureブランチ、もしくはワークツリーを切って作業を進める
- PRのタイトルとコミットメッセージのプレフィクスはConventional Commits形式に沿う
- PRの本分やコミットメッセージは日本語
- Squashマージのみ

## 注意
- Codexへ）必ず日本語で会話すること
- `task github` をCIに入れていないのは意図的にそうしている
