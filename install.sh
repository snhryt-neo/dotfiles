#!/bin/bash
set -e

# フォントのインストール
git clone --branch=master --depth 1 https://github.com/ryanoasis/nerd-fonts.git
cd nerd-fonts && ./install.sh FiraMono
cd .. && rm -rf nerd-fonts

# シンボリックリンク
SRC_DIRPATH="$HOME/dotfiles"
DST_DIRPATH="$HOME"

ZSHRC=".zshrc"
ln -s "${SRC_DIRPATH}/${ZSHRC}" "$HOME/${ZSHRC}"
GIT_CFG=".gitconfig"
ln -s "${SRC_DIRPATH}/${GIT_CFG}" "$HOME/${GIT_CFG}"
GIT_COMMIT_CFG=".gitmessage"
ln -s "${SRC_DIRPATH}/${GIT_COMMIT_CFG}" "$HOME/${GIT_COMMIT_CFG}"
STARSHIP_CFG="starship.toml"
ln -s "${SRC_DIRPATH}/${STARSHIP_CFG}" "${DST_DIRPATH}/.config/${STARSHIP_CFG}"

