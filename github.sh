#!/usr/local/bin/zsh
set -e

# SSH鍵の生成
SSH_CFGDIR="$HOME/.ssh"
if [ ! -d "$SSH_CFGDIR" ]; then
  mkdir -p "$SSH_CFGDIR"
fi
ssh-keygen -t ed25519 -C "$GIT_USER_EMAIL"
eval "$(ssh-agent -s)"

# 以降は対話形式でSSH鍵ファイルの登録まで行う
gh auth login
