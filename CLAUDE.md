# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 概要
Mac環境を想定したパッケージ管理 (via Homebrew) やGitのグローバル設定、`.zshrc` の管理、Claude Codeのユーザースコープの設定とエージェントスキルなどを統合管理するためのリポジトリ。

## 主な技術
- **タスク管理**: `Taskfile.yml` が各シェルスクリプト(`init.sh`, `link.sh`, `github.sh`, `gui.sh`, `nonbrew.sh`)を順次実行
- **Homebrew**: `brewfiles/Brewfile`(CLIツール・cask)と `brewfiles/Brewfile.mas`(App Store)で宣言的管理
- **mise**: グローバルで利用する python, node などのバージョン管理
- **gh skill**: 外部公開されているエージェントスキルの管理
- **CI**: GitHub Actions (`.github/workflows/actions.yml`) がPR時にmacOSランナーでセットアップをテスト

## よく使うコマンド
```bash
task brew           # Homebrew パッケージをインストール/更新
task brew-mas       # Mac App Store アプリをインストール/更新
task nonbrew        # Homebrew 以外 (node, uv) のパッケージをインストール
task link           # シンボリックリンクを作成
task skills         # Skillfile から外部スキルをインストール
task skills-update  # インストール済み外部スキルをアップデート
```

## ワークツリーの管理

`claude agents` コマンドでサブエージェントを起動すると、`.claude/worktrees/` 配下にワークツリーが作成される。
マージ済みのものは定期的に以下の手順で削除する。

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
- ワークツリーで作業する際は `task link` および `link.sh` の実行は行わないこと（シンボリックリンクで参照する先がワークツリーの内部になってしまう）
- `task github` をCIに入れていないのは意図的にそうしている
