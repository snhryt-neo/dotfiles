#!/bin/zsh
set -e

# 環境変数のバリデーション
if [ -z "$GIT_USER_EMAIL" ]; then
  echo "❌ Error: GIT_USER_EMAIL environment variable is not set"
  echo "Please set it with: export GIT_USER_EMAIL=\"your-email@example.com\""
  exit 1
fi

# メールアドレス形式の簡易的なバリデーション
if ! echo "$GIT_USER_EMAIL" | grep -qE '^[^@]+@[^@]+\.[^@]+$'; then
  echo "❌ Error: GIT_USER_EMAIL does not appear to be a valid email address"
  echo "Current value: $GIT_USER_EMAIL"
  exit 1
fi

echo "✅ Using email: $GIT_USER_EMAIL"

# SSH鍵の生成
SSH_CFGDIR="$HOME/.ssh"
if [ ! -d "$SSH_CFGDIR" ]; then
  mkdir -p "$SSH_CFGDIR"
fi
ssh-keygen -t ed25519 -C "$GIT_USER_EMAIL"
eval "$(ssh-agent -s)"

# 以降は対話形式でSSH鍵ファイルの登録まで行う
gh auth login
