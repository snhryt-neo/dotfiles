# dotfiles

## Situation
- Macbookを買ったばかりで、アプリやツールもほとんど入ってない状態
- macOS x ARMシリコン

## Requirements
- ターミナルのアプリ
- 以下が実行可能なshell（バージョン不問）
  - `git`
  - `curl`

## Usage
スタートはどこのディレクトリでも別にいいけど、ホームディレクトリ上でやるのが好ましいかも

```shell
$ git clone https://github.com/snhryt-neo/dotfiles.git
$ cd dotfiles
$ export GIT_USER_EMAIL="xxxxx@xxxxx"   # GitHubに登録しているメールアドレス
$ export GLOBAL_PYTHON_VERSION="3.11.3" # pyenvでインストールするPythonのバージョン
$ ./install.sh
$ # 以降、大体20分ぐらいかかる＆ちょこちょこインタラクティブにターミナル操作する必要あり
```
