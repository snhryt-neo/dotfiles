# shellcheck shell=bash
# shellcheck disable=SC1090,SC1091

export CLICOLOR=1
export TMPDIR="$HOME/.tmp"

# ======================================================================
# PATH
# ======================================================================
typeset -U path PATH
path=(
  /opt/homebrew/bin
  /usr/local/bin
  /usr/local/sbin
  "$HOME/.local/bin"
  "$HOME/.rd/bin"
  "${path[@]}"
)

# ======================================================================
# Tool init
# ======================================================================
eval "$(mise activate zsh)"
eval "$(zoxide init zsh)"

# gcloud
if command -v brew >/dev/null 2>&1; then
  source "$(brew --prefix)/share/google-cloud-sdk/path.zsh.inc"
  source "$(brew --prefix)/share/google-cloud-sdk/completion.zsh.inc"
fi

# ======================================================================
# Zsh plugin manager
# ======================================================================
eval "$(sheldon source)"

# ======================================================================
# Zsh Completion
# ======================================================================
autoload -Uz compinit
compinit

# Entire CLI
source <(entire completion zsh)

# ======================================================================
# Options
# ======================================================================
setopt auto_cd
setopt auto_pushd
setopt pushd_ignore_dups

# ======================================================================
# Alias
# ======================================================================

## Core replacements
alias cd='z'
alias ls='lsd -F --group-directories-first'
alias find='fd'
alias cat='bat'
alias grep='rg'
alias ps='procs'
alias top='btm'
alias df='duf'
alias du='dust'
alias rm='trash'
# alias curl='https' # さすがに curl とは違いすぎた

## General
alias vi='vim'
alias ll='ls -lg'
alias la='ls -A'
alias sz='source ~/.zshrc'
alias cz='cat ~/.zshrc'
alias vz='vi ~/.zshrc'

## Git
alias gs='git status'
alias ga='git add'
alias gl='git log'
alias gd='git diff'
alias gsw='git switch -C'
alias gcm='git switch main'
alias gcd='git switch -C develop'
alias gsl='git stash list'

## Claude Code
alias claude-dang='claude --dangerously-skip-permissions'
alias ccc='cat ~/.claude/settings.json'
alias vcc='vi ~/.claude/settings.json'

## Google Cloud
alias gcactivate='switch_gcloud_configuration'

switch_gcloud_configuration() {
  gcloud config configurations activate "$(
    gcloud config configurations list \
      | awk 'NR>1 {print $1}' \
      | peco
  )"
}
