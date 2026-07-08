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
# エラーが発生したら task nonbrew のようにタスク個別で指定すると効率よし
$ rm -r ./bin # Homebrew経由で go-task インストール済のため、バイナリからインストールしたものは消す
```

エージェントスキルは自作・外部を問わず [APM](https://github.com/microsoft/apm) で管理する。
`apm/apm.yml` に宣言したスキルが `task skills` で `~/.claude/skills` と `~/.agents/skills` の両方へ展開されるため、Claude Code と Codex の双方から利用できる。
バージョンは `apm/apm.lock.yaml` のコミットSHAで固定され、`task skills-update` で更新する。
自作スキル（`claude_global/skills/` 配下）も GitHub 経由の自己参照でインストールされるため、編集内容は main へのマージ後に `task skills-update` を実行して反映する。

## Directory Structure
```bash
$ tree -aF -L 4 --dirsfirst -I .git -I .gitignore -I .DS_Store
./
├── .claude/
│   └── settings.json       # Claude Code の設定
├── .github/
│   └── workflows/
│       └── actions.yml     # GitHub Actionsによる一部インストールのテスト
├── apm/ # APM で管理するエージェントスキルの宣言（~/.apm/ にリンク）
│   ├── apm.lock.yaml
│   └── apm.yml
├── bat/ # bat（catコマンドのカラー版）のconfig
│   └── config
├── brewfiles/ # brew bundle でインストールするアプリ・コマンドの一覧
│   ├── Brewfile
│   └── Brewfile.mas
├── claude_global/
│   ├── skills/             # 自作スキル（apm/apm.yml の自己参照エントリ経由でインストールされる）
│   ├── CLAUDE.md           # 全プロジェクト共通の作業規約（~/.claude/CLAUDE.md と ~/.codex/AGENTS.md にリンク）
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
└── nonbrew.sh*
```
