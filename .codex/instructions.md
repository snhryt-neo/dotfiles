# General
- 必ず日本語でやりとりをする
- 絵文字利用してOK
- コード内のコメントはすべて日本語で書く
- READMEを書くときには少なくとも以下の構成要素を含める
  - Overview
  - Prerequisites
  - Installation
  - Usage
    - Local Run
    - Deploy/Delete
  - Directory Structure
    - `tree -aL 3 -I .venv -I .git -I __pycache__ --dirsfirst` の出力結果と、各ディレクトリにどのようなファイル群が含まれるかのコメント
  - Design
- 簡易なものでよいのでGitHub ActionsのCI/CDのコードを書く
- 単色のグラフを書く際に、特別指示がない場合は #1DC143 のカラーコードを用いる

---

# 言語別

## Python
- ワークスペース初期化時には以下を最初にすること
  - https://github.com/pre-commit/pre-commit-hooks/releases でpre-commit-hooksのLatestバージョンを確認
  - https://github.com/astral-sh/ruff-pre-commit/releases でruff-pre-commitのLatestバージョンを確認
  - 以下コマンドを実行

```bash
$ curl -o .gitignore https://raw.githubusercontent.com/github/gitignore/refs/heads/main/Python.gitignore
$ uv --version
$ uv init
$ mkdir src
$ mv main.py src/
$ cat <<EOF > .pre-commit-config.yaml
repos:
  - repo: https://github.com/pre-commit/pre-commit-hooks
    rev: {{ 上記で確認したpre-commit-hooksのLatestバージョン }}
    hooks:
      - id: check-yaml
      - id: end-of-file-fixer
      - id: trailing-whitespace
  - repo: https://github.com/astral-sh/ruff-pre-commit
    rev: {{ 上記で確認したruff-pre-commitのLatestバージョン }}
    hooks:
      - id: ruff # Run the linter.
        args: [--fix]
        exclude: ^work/ # Exclude the work folder.
      - id: ruff-format # Run the formatter.
EOF
$ pre-commit install
```

- パッケージ管理はuvで行う。例: `uv add pandas`
- 仮想環境の管理もuvで行う。例: `uv run python main.py`
- 関数の引数のみに型アノテーションをつける。基本的には list, dict, tuple などのジェネリック型定義を使って、それで対応しきれないもののみ from typing import XXX で対応する
- 関数にはdocstringをつける。スタイルはNumPyスタイル
- pandasでNoneを定義するときは np.nan ではなく pd.NA を使う
- classを採用する場合はなるべくdataclassで代替する
- 他ファイルから参照しない関数はprefixに "_" を付与すること
- Makefileで以下のマニフェストを定義すること
  - help: ヘルプ ※ デフォルト
  - setup: uv sync と pre-commit install
  - run: ローカルでの実行。uv run xxx
  - deploy: gcloud経由でのCloud Run関数&Cloud Schedulerへのデプロイ
    - requirements.txt を出力する際は `uv pip compile pyproject.toml -o ./src/requirements.txt` で一時的に吐き出し、その後削除するようにする
  - delete: make deploy で作成したリソースのgcloudコマンド経由での削除
- 機械学習モデルは、特に指定がなければ最初はLightGBMで取り組むこと。また、SHAPによる特徴量重要度の可視化もセットで行うこと

