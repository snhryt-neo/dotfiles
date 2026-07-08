#!/bin/zsh
set -e

backup_and_link() {
  local src_path=$1
  local dst_path=$2
  local name=$3
  local timestamp backup current_target

  if [ ! -e "$src_path" ]; then
    echo "❌ Source not found: $src_path" >&2
    return 1
  fi

  # 既にシンボリックリンクが存在する場合の処理
  if [ -L "$dst_path" ]; then
    # 現在のリンク先を取得（壊れたリンクでもエラーにしないために || true）
    current_target=$(readlink "$dst_path" || true)

    # すでに期待しているリンク先（src_path）を向いている場合は何もしない
    if [ "$current_target" = "$src_path" ]; then
      echo "⏭️ $name is already linked"
      return 0
    fi

    # 別のリンク先を向いている場合はバックアップを作成して退避する
    # バックアップのサフィックスには現在のタイムスタンプを付与
    timestamp=$(date '+%Y%m%d_%H%M%S')
    backup="${dst_path}_${timestamp}"
    mv "$dst_path" "$backup"
    echo "🚚 Existing symlink for $name was backed up to $backup"

  elif [ -e "$dst_path" ]; then
    # ファイルまたはディレクトリの実態が存在する場合はバックアップを作成する
    # バックアップのサフィックスには現在のタイムスタンプを付与
    timestamp=$(date '+%Y%m%d_%H%M%S')
    backup="${dst_path}_${timestamp}"
    mv "$dst_path" "$backup"
    echo "🚚 $name was backed up to $backup"
  fi

  # シンボリックリンクを作成する
  ln -s "$src_path" "$dst_path"
  echo "🎉 Created symbolic link to $name"
}

replace_and_link() {
  local src_path=$1
  local dst_path=$2
  local name=$3
  local current_target normalized_src

  if [ ! -e "$src_path" ]; then
    echo "❌ Source not found: $src_path" >&2
    return 1
  fi

  normalized_src=${src_path%/}
  if [ -L "$dst_path" ]; then
    current_target=$(readlink "$dst_path" || true)
    if [ "$current_target" = "$src_path" ] || [ "$current_target" = "$normalized_src" ]; then
      echo "⏭️ $name is already linked"
      return 0
    fi
  fi

  if [ -e "$dst_path" ] || [ -L "$dst_path" ]; then
    rm -rf "$dst_path"
    echo "🗑️ Replaced existing $name"
  fi

  ln -s "$src_path" "$dst_path"
  echo "🎉 Created symbolic link to $name"
}

link_local_skills() {
  local skills_dir=$1
  local label=$2
  local mode=$3
  local skill_src skill_name

  if [ -L "$skills_dir" ]; then
    rm "$skills_dir"
    echo "🔄 Converted $label from symlink to real directory"
  fi
  mkdir -p "$skills_dir"

  for skill_src in "$HERE/claude_global/skills/"*/; do
    skill_name=$(basename "$skill_src")
    # gitignore 対象（外部スキル）はスキップ
    git -C "$HERE" check-ignore -q "claude_global/skills/$skill_name" && continue

    if [ "$mode" = "replace" ]; then
      replace_and_link "$skill_src" "$skills_dir/$skill_name" "$label/$skill_name"
    else
      backup_and_link "$skill_src" "$skills_dir/$skill_name" "$label/$skill_name"
    fi
  done
}

# スクリプト自身のあるディレクトリ
HERE=$(cd "$(dirname "$0")" && pwd)

# ~/ 直下に置く .xxx 系のファイル群
for dotfile in .zshrc; do
  SRC_PATH="$HERE/$dotfile"
  DST_PATH="$HOME/$dotfile"
  backup_and_link "$SRC_PATH" "$DST_PATH" "$dotfile"
done

# ~/.config 直下に置く設定ファイル・ディレクトリ群
CFGDIR="$HOME/.config"
mkdir -p "$CFGDIR"
for cfg in bat git karabiner sheldon ccstatusline; do
  SRC_PATH="$HERE/$cfg"
  DST_PATH="$CFGDIR/$cfg"
  backup_and_link "$SRC_PATH" "$DST_PATH" "$cfg"
done

# Claude Code のグローバルな設定（claude_global/ 配下を ~/.claude/ に一括リンク）
CLAUDEDIR="$HOME/.claude"
mkdir -p "$CLAUDEDIR"
for entry in "$HERE/claude_global/"*; do
  name=$(basename "$entry")
  [ "$name" = "skills" ] && continue  # skills は後で個別処理
  backup_and_link "$entry" "$CLAUDEDIR/$name" ".claude/$name"
done

# ~/.claude/skills/ は実ディレクトリとして確保し、ローカルスキルのみ個別リンク
# （外部スキルは task skills で直接インストールされる）
SKILLSDIR="$CLAUDEDIR/skills"
link_local_skills "$SKILLSDIR" ".claude/skills" "backup"

# ~/.agents/skills/ にもローカルスキルをリンクし、Codex などの agents 系ツールから参照できるようにする
AGENTSSKILLSDIR="$HOME/.agents/skills"
link_local_skills "$AGENTSSKILLSDIR" ".agents/skills" "replace"

# Codex のグローバルな AGENTS.md
# 作業規約はツール中立な内容のため、Claude Code と同じ claude_global/CLAUDE.md を参照させる。
# ※ config.toml は Codex が実行時に書き換える（trust_level 等）ため意図的にリンク管理しない（PR #40）
CODEXDIR="$HOME/.codex"
mkdir -p "$CODEXDIR"
backup_and_link "$HERE/claude_global/CLAUDE.md" "$CODEXDIR/AGENTS.md" ".codex/AGENTS.md"

# Ghostty
GHOSTTYDIR="$HOME/Library/Application Support/com.mitchellh.ghostty"
mkdir -p "$GHOSTTYDIR"
SRC_PATH="$HERE/ghostty/config"
DST_PATH="$GHOSTTYDIR/config"
backup_and_link "$SRC_PATH" "$DST_PATH" ghostty/config

# Serena
SERENADIR="$HOME/.serena"
mkdir -p "$SERENADIR"
SRC_PATH="$HERE/.serena/serena_config.yml"
DST_PATH="$SERENADIR/serena_config.yml"
backup_and_link "$SRC_PATH" "$DST_PATH" ".serena/serena_config.yml"
