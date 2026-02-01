#!/bin/zsh
set -e

backup_and_link() {
  local src_path=$1
  local dst_path=$2
  local name=$3

  if [ -L "$dst_path" ]; then
    # すでにシンボリックリンクが貼られている場合は無視する
    echo "⚠️ $dst_path is already a symbolic link"
    return
  elif [ -e "$dst_path" ]; then
    # ファイルまたはディレクトリの実態存在する場合はバックアップを作成する
    # バックアップ名には本日の日付を含めて作成する
    today=$(date '+%Y%m%d')
    backup="${dst_path}_${today}"
    mv $dst_path $backup
    echo "🚚 $name was backed up to $backup"
  fi

  # シンボリックリンクを作成する
  ln -s $src_path $dst_path
  echo "🎉 Created symbolic link to $name"
}

# カレントディレクトリの取得
HERE=$(pwd)

# ~/ 直下に置く .xxx 系のファイル群
FILES=(.zshrc)
for dotfile in "${FILES[@]}"; do
  SRC_PATH="$HERE/$dotfile"
  DST_PATH="$HOME/$dotfile"
  backup_and_link $SRC_PATH $DST_PATH $dotfile
done

# ~/.config 直下に置く設定ファイル・ディレクトリ群
CFGDIR="$HOME/.config"
if [ ! -d $CFGDIR ]; then
  mkdir -p $CFGDIR
fi
CONFIGS=(bat git karabiner)
for cfg in "${CONFIGS[@]}"; do
  SRC_PATH="$HERE/$cfg"
  DST_PATH="$CFGDIR/$cfg"
  backup_and_link $SRC_PATH $DST_PATH $cfg
done
