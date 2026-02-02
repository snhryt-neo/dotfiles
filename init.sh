#!/bin/zsh
set -e

# Apple SiliconのMacでIntel Mac用のアプリを使うために Rosetta 2 が必要
# 参考: https://blog.amedama.jp/entry/macos-install-rosetta2-cli
if [ "$(uname -m)" = "arm64" ] ; then
  softwareupdate --install-rosetta --agree-to-license
fi

# Homebrewのインストール https://brew.sh/ja/
if ! command -v brew &> /dev/null; then
  echo "📦 Installing Homebrew..."
  /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
else
  echo "✅ Homebrew is already installed"
fi

# Homebrewのパスを通す
if [ -f "/opt/homebrew/bin/brew" ]; then
  eval "$(/opt/homebrew/bin/brew shellenv zsh)"
elif [ -f "/usr/local/bin/brew" ]; then
  eval "$(/usr/local/bin/brew shellenv)"
fi
