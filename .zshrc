source ~/.zplug/init.zsh

export CLICOLOR=1

# PATH
# Homebrew
export PATH="/usr/local/sbin:$PATH"

# Git (installed by Homebrew)
export PATH="/usr/local/bin/git:$PATH"

# pyenv
export PYENV_ROOT="$HOME/.pyenv"
export PATH="$PYENV_ROOT/bin:$PATH"

# Poetry
export PATH="$HOME/.poetry/bin:$PATH"

# pipx
export PATH="$HOME/.local/bin:$PATH"


# Alias

## Substitute basic commands
## https://zenn.dev/the_exile/articles/5176b7a5c29bce
alias du='dust'
alias cat='bat'
alias ls='exa -l'
alias find='fd'
alias df='duf'
alias ps='procs'
alias top='bottom'
alias cd='z'
alias grep='rg'
# さすがに curl とは違いすぎた: https://httpie.io/docs/cli/
# alias curl='https'

## General
alias vi='vim'
alias ll='ls -lG'
alias la='ls -alG'
alias sz='source ~/.zshrc'
alias cz='cat ~/.zshrc'
alias vz='vi ~/.zshrc'
# alias vb='vi ~/.Brewfile'
# alias cb='cat ~/.Brewfile'

## Git
alias g='git'
compdef g=git

alias gs='git status'
alias gl='git log'
alias ga='git add'
alias gc='git commit'
alias gm='git merge'
alias gcm='git checkout main'
alias gcd='git checkout develop'

## GCP (gcloud)
alias gce-start='gcloud compute instances start shinahara-y --zone us-central1-a'
alias gce-stop='gcloud compute instances stop shinahara-y --zone us-central1-a'
alias gce-ssh='gcloud compute ssh shinahara-y --zone us-central1-a'
alias gce-scp='gcloud compute scp --recurse --zone us-central1-a'
alias gcloud-switch='switch_gcloud_configuration'

function switch_gcloud_configuration() {
  gcloud config configurations activate $(gcloud config configurations list | awk '{print $1}' | grep -v NAME | peco)
}

# Color theme
zplug "yous/lime"
zplug "zsh-users/zsh-completions"
# zplug "zsh-users/zsh-autosuggestions"
zplug "zsh-users/zsh-history-substring-search"
zplug "zsh-users/zsh-syntax-highlighting"

# 'cd' なしで移動する
setopt auto_cd
setopt auto_pushd

# 重複するディレクトリは記録しないようにする
setopt correct

# 'cd -' [Tab] で以前移動したディレクトリに移動する
setopt pushd_ignore_dups

# 移動した後は 'ls' する
function chpwd() { ls -F }

if ! zplug check --verbose; then zplug install;fi
zplug load #--verbose

# The next line updates PATH for the Google Cloud SDK.
if [ -f '/Users/snhryt/Library/google-cloud-sdk/path.zsh.inc' ]; then . '/Users/snhryt/Library/google-cloud-sdk/path.zsh.inc'; fi

# The next line enables shell command completion for gcloud.
if [ -f '/Users/snhryt/Library/google-cloud-sdk/completion.zsh.inc' ]; then . '/Users/snhryt/Library/google-cloud-sdk/completion.zsh.inc'; fi

# Pyenv init
eval "$(pyenv init --path)"

# Zoxide init
eval "$(zoxide init zsh)"

# Starship init
eval "$(starship init zsh)"

