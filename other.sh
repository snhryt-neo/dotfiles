#!/usr/local/bin/zsh
set -e

# =============================================================================
# zplugのインストール（Homebrew経由だと変になったことがあるため公式手順通りにcurlでインストール）
# https://github.com/zplug/zplug
# =============================================================================
if [ ! -d "$HOME/.zplug" ]; then
  echo "📦 Installing zplug..."
  curl -sL --proto-redir -all,https https://raw.githubusercontent.com/zplug/installer/master/installer.zsh | zsh
else
  echo "✅ zplug is already installed"
fi

# =============================================================================
# Python実行環境の構築
# =============================================================================
# asdfで最新のPythonをインストール＆グローバルなバージョンに設定
if ! asdf plugin list | grep -q "^python$"; then
  echo "📦 Adding asdf python plugin..."
  asdf plugin add python
else
  echo "✅ asdf python plugin is already added"
fi
asdf install python latest
asdf set --home python "$(asdf list python | sed 's/  //')"

# =============================================================================
# Node.js実行環境の構築
# =============================================================================
# asdfで最新のNode.jsをインストール＆グローバルなバージョンに設定
if ! asdf plugin list | grep -q "^nodejs$"; then
  echo "📦 Adding asdf nodejs plugin..."
  asdf plugin add nodejs
else
  echo "✅ asdf nodejs plugin is already added"
fi
asdf install nodejs latest
asdf set --home nodejs "$(asdf list nodejs | sed 's/  //')"

# brew ではなく npm でいれるべきツールをインストール
npm i -g @openai/codex
npm i -g @dataform/cli
