# dotfiles


<!-- @import "[TOC]" {cmd="toc" depthFrom=2 depthTo=3 orderedList=false} -->

<!-- code_chunk_output -->

- [Situation](#situation)
- [Requirements](#requirements)
- [Usage](#usage)
- [Directory Structure](#directory-structure)

<!-- /code_chunk_output -->


## Situation
- Macbookを買ったばかりで、アプリやツールもほとんど入ってない状態
- macOS

## Requirements
- プリインストールされている「ターミナル」アプリ
- 以下コマンドを使える状態に
  - `git` ← XCodeのインストールを求められると思われる
  - `curl`

## Usage
スタートはどこのディレクトリでも別にいいけど、ホームディレクトリ上でやるのが好ましいかも

```bash
$ git clone https://github.com/snhryt-neo/dotfiles.git
$ cd dotfiles
$ sh -c "$(curl --location https://taskfile.dev/install.sh)" -- -d # タスクランナーの go-task をバイナリからインストール
$ export PATH="$PATH:$(pwd)/bin"      # go-task が ./bin にインストールされるのでパスを通す
$ export GIT_USER_EMAIL="xxxxx@xxxxx" # GitHubに登録しているメールアドレス
$ task setup-all
# 以降、大体20分ぐらいかかる＆ちょこちょこインタラクティブにターミナル操作する必要あり
# エラーが発生したら task other のようにタスク個別で指定すると効率よし
$ rm -r ./bin # Homebrew経由で go-task インストール済のため、バイナリからインストールしたものは消す
```

## Directory Structure
```bash
$ tree -aF -L 4 --dirsfirst -I .git -I .gitignore -I .DS_Store
./
├── .claude/
│   └── settings.json       # Claude Code のフック設定（entire 連携）
├── .entire/
│   └── settings.json       # Entire CLI の設定（AIセッション記録ツール）
├── .github/
│   └── workflows/
│       └── actions.yml     # GitHub Actionsによる一部インストールのテスト
├── bat/ # bat（catコマンドのカラー版）のconfig
│   └── config
├── brewfiles/ # brew bundle でインストールするアプリ・コマンドの一覧
│   ├── Brewfile
│   └── Brewfile.mas
├── claude_global/
│   └── settings.json       # Claude Code のグローバル設定（~/.claude/settings.json にリンク）
├── git/ # グローバルなGitの設定
│   ├── templates/
│   │   ├── secrets/ # git init時の git-secrets 自動追加設定
│   │   │   └── hooks/
│   │   └── commit-message # Conventional commits のリファレンス
│   ├── config # ~/.gitconfig と等価
│   └── ignore # macOS用のグローバルなignore設定
├── karabiner/ # Karabiner-Elements のキーバインディング
│   ├── assets/
│   │   └── complex_modifications/
│   │       └── 1726838703.json # https://ke-complex-modifications.pqrs.org/#japanese
│   └── karabiner.json
├── snapshots/ # 手動インストール対応が必要なもののスナップショット
│   ├── black-formatter-settings_20240922.json
│   └── chrome-extensions_20240922.html
├── .pre-commit-config.yaml # pre-commit config
├── .zshrc                  # zsh config
├── CLAUDE.md               # Claude Code へのプロジェクト指示
├── README.md               # このドキュメント
├── Taskfile.yml            # タスクランナーの設定ファイル (go-task)
├── github.sh*              # 以下、詳細は Taskfile.yml を参照
├── gui.sh*
├── init.sh*
├── link.sh*
└── other.sh*
```
