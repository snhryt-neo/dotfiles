#!/usr/local/bin/zsh
set -e

# =============================================================================
# zplugのインストール（Homebrew経由だと変になったことがあるため公式手順通りにcurlでインストール）
# https://github.com/zplug/zplug
# =============================================================================
curl -sL --proto-redir -all,https https://raw.githubusercontent.com/zplug/installer/master/installer.zsh | zsh

# =============================================================================
# Python実行環境の構築
# =============================================================================
# asdfで最新のPythonをインストール＆グローバルなバージョンに設定
asdf plugin-add python
asdf install python latest
asdf global python "$(asdf list python | sed 's/  //')"

# Poetry（公式のインストールオプションにHomebrewがないためcurlでインストールする）
# https://python-poetry.org/docs/#installing-with-the-official-installer
curl -sSL https://install.python-poetry.org | python3 -
