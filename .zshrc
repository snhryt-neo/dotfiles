export CLICOLOR=1
autoload -Uz compinit && compinit

# PATHを通す
export PATH="/usr/local/sbin:$PATH" # Homebrew
export PATH="/usr/local/bin/git:$PATH" # Git (installed by Homebrew)
export PATH="$HOME/.local/bin:$PATH" # pipx
export PATH="$HOME/.local/bin/poetry:$PATH" # Poetry

# Initialization
# ============================================================
# IntelチップとM1チップで brew install したコマンドのインストール先が異なる
INTEL_BREW_DIRPATH=/usr/local
ARM_BREW_DIRPATH=/opt/homebrew

# zplug
INTEL_ZPLUG_INIT_FILEPATH="$INTEL_BREW_DIRPATH/Cellar/zplug/init.zsh"
ARM_ZPLUG_INIT_FILEPATH="$ARM_BREW_DIRPATH/Cellar/zplug/$(zplug --version)/init.zsh"
if [ -f $INTEL_ZPLUG_INIT_FILEPATH ]; then
  source $INTEL_ZPLUG_INIT_FILEPATH
else
  source $ARM_ZPLUG_INIT_FILEPATH
fi

# asdf
ASDF_COMMON_PATH="opt/asdf/libexec/asdf.sh"
INTEL_ASDF_INIT_FILEPATH="$INTEL_BREW_DIRPATH/$ASDF_COMMON_PATH"
ARM_ASDF_INIT_FILEPATH="$ARM_BREW_DIRPATH/$ASDF_COMMON_PATH"
if [ -f $INTEL_ASDF_INIT_FILEPATH ]; then
  source $INTEL_ASDF_INIT_FILEPATH
else
  source $ARM_ASDF_INIT_FILEPATH
fi

# anyenv
eval "$(anyenv init -)"

# Zoxide
eval "$(zoxide init zsh)"

# Starship
eval "$(starship init zsh)"
# ============================================================

# Alias
# ============================================================
## Substitution of basic commands
alias cd='z'
alias ls='exa -l'
alias find='fd'
alias cat='bat'
alias grep='rg'
# alias curl='https' # ← さすがに curl とは違いすぎた
alias ps='procs'
alias top='bottom'
alias df='duf'
alias du='dust'

## General
alias vi='vim'
alias ll='ls -lG'
alias la='ls -alG'
alias sz='source ~/.zshrc'
alias cz='cat ~/.zshrc'
alias vz='vi ~/.zshrc'
alias rm='trash-put' # https://github.com/andreafrancia/trash-cli

## Git
alias g='git'
compdef g=git

alias gs='git status'
alias ga='git add'
alias gc='git commit'
alias gl='git log'
alias gd='git diff'
alias gco='git checkout'
alias gcm='git checkout main'
alias gsl='git stash list'

## gcloud
alias gce-start='gcloud compute instances start shinahara-y --zone us-central1-a'
alias gce-stop='gcloud compute instances stop shinahara-y --zone us-central1-a'
alias gce-ssh='gcloud compute ssh shinahara-y --zone us-central1-a'
alias gce-scp='gcloud compute scp --recurse --zone us-central1-a'
alias gcloud-switch='switch_gcloud_configuration'

function switch_gcloud_configuration() {
  gcloud config configurations activate $(gcloud config configurations list | awk '{print $1}' | grep -v NAME | peco)
}
# ============================================================

# Zplug plugins
zplug "yous/lime"
zplug "zsh-users/zsh-completions"
# zplug "zsh-users/zsh-autosuggestions"
zplug "zsh-users/zsh-history-substring-search"
zplug "zsh-users/zsh-syntax-highlighting"
zplug "greymd/docker-zsh-completion"

# 'cd' なしで移動する
setopt auto_cd
setopt auto_pushd

# 重複するディレクトリは記録しないようにする
setopt correct

# 'cd -' [Tab] で以前移動したディレクトリに移動する
setopt pushd_ignore_dups

# 移動した後は 'ls' する
function chpwd() { ls -F }

if ! zplug check --verbose; then
  zplug install
  fi
zplug load #--verbose
