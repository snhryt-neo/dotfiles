#!/bin/bash
set -e

# フォントのインストール
git clone --branch=master --depth 1 https://github.com/ryanoasis/nerd-fonts.git
cd nerd-fonts && ./install.sh FiraMono
cd .. && rm -rf nerd-fonts

# .Brewfile の内容をインストール
brew bundle

# Python実行環境の構築
DEFAULT_PYTHON="3.11.3"
anyenv update
anyenv install pyenv
pyenv install $DEFAULT_PYTHON
pyenv global $DEFAULT_PYTHON
pip install -U pip
pipx install poetry

# シンボリックリンク作成（すでにファイルが存在する場合はバックアップを一応取る）
FILES=(.zshrc .gitmessage .gitconfig)
for dotfile in "${FILES[@]}"; do
  # $HOMEディレクトリにあるファイルのパス
  DST_PATH="$HOME/$dotfile"

  # $HOMEディレクトリにファイルが存在する場合は、バックアップを作成する
  if [ -f "$DST_PATH" ]; then
    # バックアップファイル名を本日の日付を含めて作成する
    TODAY=$(date '+%Y%m%d')
    BACKUP_FILE="$DST_PATH.$TODAY.backup"

    # バックアップファイルを作成する
    mv $DST_PATH $BACKUP_FILE
    echo "Existing $dotfile backed up to $BACKUP_FILE"
  fi

  # dotfilesディレクトリのファイルにシンボリックリンクを作成する
  ln -s $dotfile $DST_PATH
  echo "Created symbolic link to $dotfile"
done

# Starship に関する設定はおそらく存在しないはずので、上記のように丁寧にはやらない
DST_DIR="$HOME/.config"
if [ ! -d "$DST_DIR" ]; then
  mkdir -p "$DST_DIR"
fi
STARSHIP_CFG="starship.toml"
ln -s $STARSHIP_CFG "$DST_DIR/$STARSHIP_CFG"
