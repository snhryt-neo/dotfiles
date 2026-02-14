# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 概要

macOS dotfilesリポジトリ。go-taskによるタスク実行とシンボリックリンクで設定ファイルを管理する。ARM64/Intel両対応。

## 言語

日本語でやりとりする。コメントも日本語。絵文字OK。

## コマンド

```bash
# セットアップ (go-task)
task setup-all              # 全タスク一括実行
task init / brew / link / gui / git / other  # 個別実行

# Lint / Format
pre-commit run --all-files  # 全フック実行
shellcheck -x <script>.sh   # シェルスクリプト静的解析
shfmt -i 2 -ci <script>.sh  # フォーマット (2スペースインデント)
```

## アーキテクチャ

- **シンボリックリンク**: `link.sh` が冪等にリンクを作成（既存リンクはスキップ、既存ファイルは日付付きバックアップ）
  - `FILES`配列 → `~/` 直下、`CONFIGS`配列 → `~/.config/` 配下
- **タスク管理**: `Taskfile.yml` が各シェルスクリプト(`init.sh`, `link.sh`, `github.sh`, `gui.sh`, `other.sh`)を順次実行
- **Homebrew**: `brewfiles/Brewfile`(CLIツール・cask)と `brewfiles/Brewfile.mas`(App Store)で宣言的管理
- **CI**: GitHub Actions (`.github/workflows/actions.yml`) がPR時にmacOSランナーでセットアップをテスト

## 規約

- シェルスクリプト: `#!/bin/zsh` + `set -e` + 冪等性を担保
- コミットメッセージ: Conventional Commits 形式、日本語で記述（例: `feat: ログイン機能を追加`）
