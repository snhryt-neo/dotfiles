#!/usr/local/bin/zsh
set -e

# Apple SiliconのMacでIntel Mac用のアプリを使うために Rosetta 2 が必要
# 参考: https://blog.amedama.jp/entry/macos-install-rosetta2-cli
if [ "$(uname -m)" = "arm64" ] ; then
  softwareupdate --install-rosetta --agree-to-license
fi

# Homebrewのインストール https://brew.sh/ja/
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
eval "$(/opt/homebrew/bin/brew shellenv)"
