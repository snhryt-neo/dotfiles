#!/bin/zsh
set -e

# =============================================================================
# mise によるグローバルバージョンの設定
# =============================================================================
echo "📦 Installing Python & Node.js globally with mise..."
mise use -g python@latest
mise use -g node@latest

# =============================================================================
# node 経由でのインストール
# =============================================================================
echo "📦 Installing global npm packages..."
# https://github.com/dataform-co/dataform
npm install -g @dataform/cli

# https://github.com/andrewyng/context-hub
npm install -g @aisuite/chub

# https://github.com/helpfeel/cosense-cli
npm install -g @helpfeel/cosense-cli

# =============================================================================
# uv 経由でのインストール
# =============================================================================
echo "📦 Installing Python tools with uv..."
# https://github.com/chopratejas/headroom
uv tool install --python 3.13 "headroom-ai[all]"
