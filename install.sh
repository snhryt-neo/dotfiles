#!/usr/local/bin/zsh
set -e

# Homebrewのインストール＆Brewfileから諸々インストール
# =============================================================================
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
brew tap --force homebrew/core
brew bundle
# =============================================================================

# GitHubまわりの設定
# =============================================================================
# SSH鍵の生成
SSH_CFGDIR="$HOME/.ssh"
if [ ! -d $SSH_CFGDIR ]; then
  mkdir -p $SSH_CFGDIR
fi
ssh-keygen -t ed25519 -C $GIT_USER_EMAIL
eval "$(ssh-agent -s)"

# 以降は対話形式でSSH鍵ファイルの登録まで行う
gh auth login

# git-secrets: https://github.com/awslabs/git-secrets
git secrets --install
# =============================================================================

# zplugのインストール（Homebrew経由だと変になるため）
# =============================================================================
# Official: https://github.com/zplug/zplug
curl -sL --proto-redir -all,https https://raw.githubusercontent.com/zplug/installer/master/installer.zsh | zsh
# =============================================================================

# シンボリックリンク作成（すでにファイルが存在する場合はバックアップを一応取る）
# =============================================================================
HERE=$(pwd)

FILES=(.zshrc .gitmessage .gitconfig)
for dotfile in "${FILES[@]}"; do
  SRC_PATH="$HERE/$dotfile"
  DST_PATH="$HOME/$dotfile"

  # $HOMEディレクトリにファイルが存在する場合は、バックアップを作成する
  if [ -f "$DST_PATH" ]; then
    # バックアップファイル名を本日の日付を含めて作成する
    TODAY=$(date '+%Y%m%d')
    BACKUP_FILE="$DST_PATH.$TODAY.backup"
    mv $DST_PATH $BACKUP_FILE
    echo "-> Existing $dotfile backed up to $BACKUP_FILE"
  fi

  # シンボリックリンクを作成する
  ln -s $SRC_PATH $DST_PATH
  echo "Created symbolic link to $dotfile"
done

CFGDIR="$HOME/.config"
if [ ! -d $CFGDIR ]; then
  mkdir -p $CFGDIR
fi
STARSHIP_CFG="starship.toml"
ln -s "$HERE/$STARSHIP_CFG" "$CFGDIR/$STARSHIP_CFG"
# =============================================================================

# フォントのインストール
# =============================================================================
git clone --branch=master --depth 1 https://github.com/ryanoasis/nerd-fonts.git
cd nerd-fonts && ./install.sh FiraMono
cd .. && rm -rf nerd-fonts
# =============================================================================

# Python実行環境の構築
# =============================================================================
# asdfで最新のPythonをインストール＆グローバルなバージョンに設定
asdf plugin-add python
asdf install python latest
asdf global python "$(asdf list python | sed 's/  //')"

# pipx経由でPoetryのインストール
pipx install poetry

# Ryeのインストール
curl -sSf https://rye-up.com/get | bash
#=============================================================================
