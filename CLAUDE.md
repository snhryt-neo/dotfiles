# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Codexへ
必ず日本語で会話すること。

## 概要

Mac環境を想定したパッケージ管理 (via Homebrew) やGitのグローバル設定、`.zshrc` の管理、Claude Codeのユーザースコープの設定とエージェントスキルなどを統合管理するためのリポジトリ。

## コマンド

```bash
# セットアップ (go-task)
task setup-all              # 全タスク一括実行
task init / brew / link / gui / git / skills / other  # 個別実行
```

## アーキテクチャ

- **タスク管理**: `Taskfile.yml` が各シェルスクリプト(`init.sh`, `link.sh`, `github.sh`, `gui.sh`, `other.sh`)を順次実行
- **Homebrew**: `brewfiles/Brewfile`(CLIツール・cask)と `brewfiles/Brewfile.mas`(App Store)で宣言的管理
- **CI**: GitHub Actions (`.github/workflows/actions.yml`) がPR時にmacOSランナーでセットアップをテスト

## Git関連
- pre-commitがパスするまでcommitしてはいけない
- GitHub Flow. 必ず最新のmainからfeatureブランチ、もしくはワークツリーを切って作業を進める
- PRのタイトルとコミットメッセージのプレフィクスはConventional Commits形式に沿う
- PRの本分やコミットメッセージは日本語
- Squashスカッシュマージのみ
