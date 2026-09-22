# dotfiles


<!-- @import "[TOC]" {cmd="toc" depthFrom=2 depthTo=3 orderedList=false} -->

<!-- code_chunk_output -->

- [Situation](#situation)
- [Requirements](#requirements)
- [Usage](#usage)
- [Gemini worker](#gemini-worker)
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

エージェントスキルとMCPは自作・外部を問わず [APM](https://github.com/microsoft/apm) で管理する。
`task skills` は `apm/apm.yml` の `targets` に従って、スキルを展開し、MCP設定を登録する。
スキルのバージョンは `apm/apm.lock.yaml` のコミットSHAで固定され、`task skills-update` で更新する。
自作スキル（`skills/` 配下）も GitHub 経由の自己参照でインストールされるため、編集内容は main へのマージ後に `task skills-update` を実行して反映する。

Codexのモデル・承認・MCPなどの実行時設定は `~/.codex/config.toml` に保存される。Codex自身が更新するため、dotfilesのリンク対象には含めない。共通の作業規約は `codex_global/AGENTS.md`、このリポジトリの指示はルートの `AGENTS.md` で管理する。

## Gemini worker

Codexが作成した作業指示を、Vertex AIのGemini 3.8 Flashへ委譲するためのPython CLIとスキルを管理する。ワーカーは作業指示書で許可されたファイルと検証コマンドだけを扱い、計画・並列実行・最終レビューはCodex側で行う。

### Prerequisites

- 課金が有効なGoogle Cloudプロジェクト
- Gemini Enterprise Agent Platform API（旧Vertex AI API）
- 呼び出し対象プロジェクトに対するGemini Enterprise Agent Platform User（`roles/aiplatform.user`）相当の権限
- quota projectを利用する場合の`serviceusage.services.use`権限
- Homebrewで導入される`uv`とGoogle Cloud CLI

### Setup

ローカル開発ではサービスアカウント鍵やGemini APIキーを使わず、ユーザーアカウントのApplication Default Credentials（ADC）を使う。

```bash
gcloud auth application-default login
gcloud auth application-default set-quota-project YOUR_PROJECT_ID
task gemini-worker-install
```

ワーカーを実行するシェルで、Vertex AIとプロジェクトを明示する。

```bash
export GOOGLE_CLOUD_PROJECT="YOUR_PROJECT_ID"
export GOOGLE_CLOUD_LOCATION="global"
export GOOGLE_GENAI_USE_VERTEXAI="true"
```

### Usage

作業指示書の例は[`skills/gemini-worker/references/request-example.json`](skills/gemini-worker/references/request-example.json)にある。Codex側で作業範囲、書き込み対象、許可コマンド、必須検証を確定してから実行する。

```bash
gemini-worker run --request /absolute/path/request.json
```

標準出力には結果JSONを1件だけ出力する。`status`が`completed`でも、実際の差分と検証結果をCodex側で確認する。`task gemini-worker-test`でVertex AIへ接続しないテストを実行できる。

ワーカーはVertex AIの`gemini-3.8-flash`を`HIGH`に固定する。APIキー環境変数が設定されている場合は起動時に拒否し、ADCが見つからない場合もエラーとして返す。サービスアカウント鍵を使う場合は、鍵をリポジトリや作業指示書へ置かず、Google Cloudの公式ガイドに従って別途管理する。

## Directory Structure
```bash
$ tree -aF -L 4 --dirsfirst -I .git -I .gitignore -I .DS_Store
./
├── .claude/
│   └── settings.json       # Claude Code の設定
├── .github/
│   └── workflows/
│       └── actions.yml     # GitHub Actionsによる一部インストールのテスト
├── apm/ # APM で管理するエージェントスキルとMCPの宣言（~/.apm/ にリンク）
│   ├── apm.lock.yaml
│   └── apm.yml
├── bat/ # bat（catコマンドのカラー版）のconfig
│   └── config
├── brewfiles/ # brew bundle でインストールするアプリ・コマンドの一覧
│   ├── Brewfile
│   └── Brewfile.mas
├── claude_global/ # ~/.claude/ 直下にリンクされる設定 (deprecated)
│   ├── CLAUDE.md
│   └── settings.json
├── codex_global/
│   └── AGENTS.md           # 全プロジェクト共通の作業規約（~/.codex/AGENTS.md にリンク）
├── fresh/ # ターミナルエディタ fresh の設定（config.json のみリンクし、自動生成物は対象外）
│   └── config.json
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
├── keyboards/
│   └── nuphy-air60-v2/ # NuPhy Air60 V2のQMK・VIA設定（QMK forkのsubmoduleを含む）
├── skills/ # 自作スキル（apm/apm.yml の自己参照エントリ経由でインストールされる）
├── snapshots/ # 手動インストール対応が必要なもののスナップショット
│   ├── black-formatter-settings_20240922.json
│   └── chrome-extensions_20240922.html
├── .pre-commit-config.yaml # pre-commit config
├── .zshrc                  # zsh config
├── AGENTS.md               # このリポジトリの作業規約
├── README.md               # このドキュメント
├── Taskfile.yml            # タスクランナーの設定ファイル (go-task)
├── mise.toml               # miseによるdotfilesのリンク設定
├── github.sh*              # 以下、詳細は Taskfile.yml を参照
├── gui.sh*
├── init.sh*
└── nonbrew.sh*
```
