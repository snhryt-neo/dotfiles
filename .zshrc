export CLICOLOR=1
autoload -Uz compinit && compinit

# PATHを通す
export PATH="$PATH:/usr/local/sbin"
export PATH="$PATH:/usr/local/bin"
export PATH="$PATH:/opt/homebrew/bin" # Homebrew (ARM)
export PATH="$PATH:$HOME/.local/bin"  # pipx
export PATH="$PATH:$HOME/.rd/bin"     # Rancher Desktop

# Initialization
# ============================================================
# zplug
source "$HOME/.zplug/init.zsh"

# asdf
# IntelチップとARMチップで brew install したコマンドのインストール先が異なる
ASDF_COMMON_PATH="opt/asdf/libexec/asdf.sh"
INTEL_ASDF_INIT_FILEPATH="/usr/local/$ASDF_COMMON_PATH"
ARM_ASDF_INIT_FILEPATH="/opt/homebrew/$ASDF_COMMON_PATH"
if [ -f $INTEL_ASDF_INIT_FILEPATH ]; then
  . $INTEL_ASDF_INIT_FILEPATH
else
  . $ARM_ASDF_INIT_FILEPATH
fi

# Zoxide
eval "$(zoxide init zsh)"

# google-cloud-sdk
source "$(brew --prefix)/share/google-cloud-sdk/path.zsh.inc"
source "$(brew --prefix)/share/google-cloud-sdk/completion.zsh.inc"
# ============================================================

# Alias
# ============================================================
## Substitution of basic commands
alias cd='z'
alias ls='lsd -F --group-directories-first'
alias find='fd'
alias cat='bat'
alias grep='rg'
# alias curl='https' # ← さすがに curl とは違いすぎた
alias ps='procs'
alias top='btm'
alias df='duf'
alias du='dust'

## General
alias vi='vim'
alias ll='ls -lg'
alias la='ls -A'
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
alias gsw='git switch -c'
alias gcm='git checkout main'
alias gsl='git stash list'

## gcloud
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
