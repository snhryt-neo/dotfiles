#!/bin/zsh
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
# miseでPython 3.13をインストール＆グローバルなバージョンに設定
echo "📦 Installing Python with mise..."
mise use -g python@3.13

# uv tool でグローバルな Python ツールをインストール
echo "📦 Installing Python tools with uv..."
uv tool install --python 3.13 "headroom-ai[all]"

# =============================================================================
# Node.js実行環境の構築
# =============================================================================
# miseで最新のNode.jsをインストール＆グローバルなバージョンに設定
echo "📦 Installing Node.js with mise..."
mise use -g node@latest

# Node.jsのインストールを待機してから npm パッケージをインストール
echo "📦 Installing global npm packages..."
npm install -g @dataform/cli
npm install -g @aisuite/chub
