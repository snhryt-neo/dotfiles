#!/bin/zsh
set -e

# ============================================================================
# Macの初期設定変更
# 公式ドキュメント: https://macos-defaults.com/
# 参考: https://zenn.dev/dani_rk/articles/19db34c9296ba7
# ============================================================================

# 起動音を小さくする
sudo nvram SystemAudioVolume=%05

# Dock関連
defaults write com.apple.dock "tilesize" -int "45"
defaults write com.apple.dock "autohide" -bool "true"
defaults write com.apple.dock "show-recents" -bool "false"

# Finder関連
defaults write NSGlobalDomain "AppleShowAllExtensions" -bool "true"
defaults write com.apple.finder "AppleShowAllFiles" -bool "false"
defaults write com.apple.finder "ShowPathbar" -bool "true"
defaults write com.apple.finder "_FXSortFoldersFirst" -bool "true"
defaults write com.apple.finder "FXPreferredViewStyle" -string "Nlsv" # 表示UIをデフォルトでリストビューにする
defaults write com.apple.finder "FXDefaultSearchScope" -string "SCcf" # 検索対象をデフォルトでカレントフォルダにする
defaults write NSGlobalDomain "NSDocumentSaveNewDocumentsToCloud" -bool "false" # ファイルアップロード等の画面でデフォルトでホームディレクトリが表示されるようにする
defaults write com.apple.finder "FXRemoveOldTrashItems" -bool "true" # ゴミ箱内のアイテムを30日以上経過したら自動的に削除する

# メニューバー表示設定
defaults write com.apple.controlcenter "NSStatusItem Visible Bluetooth" -bool true
defaults write com.apple.menuextra.battery ShowPercent -string "YES"

# Mission Control
defaults write com.apple.dock "mru-spaces" -bool "false" # アプリの利用状況に応じたスペースの自動並べ替えをしない
defaults write NSGlobalDomain "AppleSpacesSwitchOnActivate" -bool "false" # アプリ切替後にスペースを切り替えない

# スクリーンショットの影を削除
defaults write com.apple.screencapture "disable-shadow" -bool "true"

# 新しいディスクが見つかったときに Time Machine にバックアップするかどうかを尋ねない
defaults write com.apple.TimeMachine "DoNotOfferNewDisksForBackup" -bool "true"

# ↑↑↑ ここまで公式ドキュメントに記載があったもの ↑↑↑
# ============================================================================


# .DS_Store を自動生成しない
defaults write com.apple.desktopservices "DSDontWriteNetworkStores" -bool "true"
defaults write com.apple.desktopservices "DSDontWriteUSBStores" -bool "true"

# キーボードのリピート速度・リピート入力認識までの時間を最速に
defaults write -g InitialKeyRepeat -int "15"
defaults write -g KeyRepeat -int "2"

# トラックパッドの移動スピードをデフォルトより速くする
defaults write -g com.apple.trackpad.scaling -int "3"

# 各種設定変更のために Dock, Finder, SystemUIServer を再起動する
TARGETS=(Dock Finder SystemUIServer)
for target in "${TARGETS[@]}"; do
  killall "$target" &> /dev/null
done
