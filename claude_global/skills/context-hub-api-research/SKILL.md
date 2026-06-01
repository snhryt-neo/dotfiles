---
name: context-hub-api-research
description: >
  Context Hub (chub CLI) を使って外部APIやライブラリの最新仕様を調査するスキル。
  ユーザーが特定のAPIメソッド・エンドポイント・パラメータ・SDK の使い方を調べたいとき、
  ライブラリのバージョン差異を確認したいとき、「最新仕様」「現在の仕様」「ドキュメント確認」
  「API調べて」などのフレーズが出たとき、または /context-hub や /chub と入力されたときに必ず使う。
  Claude の学習データは古い可能性があるため、外部ライブラリ・APIに関する実装質問には
  積極的にこのスキルを起動すること。OpenAI, Anthropic, Stripe, GitHub, AWS など
  主要な外部APIを使うコードを書く前に必ずこのスキルで最新仕様を確認すること。
---

# Context Hub API 仕様調査

Context Hub は、コーディングエージェント向けにキュレーション済みのバージョン管理されたAPIドキュメントを提供するツール。Claude の学習データのカットオフ以降の変更も反映されているため、ハルシネーションを防ぎ正確な実装ができる。

## ステップ 1: chub CLI のインストール確認

```bash
if ! command -v chub >/dev/null 2>&1; then
  npm install -g @aisuite/chub
fi
```

インストール済みであれば何も出力せず次へ進む。

## ステップ 2: ドキュメントを検索する

ユーザーの質問からキーワードを抽出して検索する。

```bash
chub search <キーワード>
```

**例:**
- ユーザー: 「OpenAI の chat completions API でストリーミングしたい」→ `chub search openai chat`
- ユーザー: 「Stripe で支払いを実装したい」→ `chub search stripe payment`
- ユーザー: 「Claude API の tool_use を使いたい」→ `chub search anthropic`

検索結果には `<provider>/<name>` 形式のIDが表示される（例: `openai/chat`, `anthropic/claude-api`, `stripe/package`）。最も関連性の高いものを選ぶ。

## ステップ 3: ドキュメントを取得する

検索結果のIDをそのまま使う（`<provider>/<name>` 形式）。

```bash
chub get <id>
```

ユーザーのコードが Python なら `--lang py`、JavaScript/TypeScript なら `--lang js` を付ける。

```bash
chub get <id> --lang py   # Python
chub get <id> --lang js   # JavaScript/TypeScript
```

ドキュメントには `updated-on` フィールド（最終更新日）と `versions`（対応バージョン）が含まれる。これを確認することで最新仕様かどうかを判断できる。

取得したドキュメントをコンテキストとして使い、最新仕様に基づいて回答・コードを生成する。

## ステップ 4: 回答と実装

取得したドキュメントを根拠に回答する。コードを書く場合は、ドキュメントに記載された正確なメソッド名・パラメータ・レスポンス形式を使う。

「このドキュメントによると…」と出典を明示することで、ユーザーが最新情報に基づいた回答だと分かるようにする。

## ステップ 5: 重要な発見をアノテーションとして残す（任意）

セッション間で記憶が引き継がれないため、将来の参照に役立つ重要な発見（破壊的変更、非推奨になったパラメータ、注意点など）があれば記録しておく。

```bash
chub annotate <id> "<メモ内容>"
```

**例:** `chub annotate openai-chat "2024年以降は model=gpt-4o がデフォルト推奨。gpt-4-turbo は非推奨になりつつある"`

## ドキュメントが見つからない場合

`chub search` で該当するドキュメントが見つからない場合は、その旨をユーザーに伝え、公式ドキュメントの URL を確認してから回答する。Context Hub に未登録のAPIについては学習データを使うが、不確実な部分は明示する。

## フィードバック（任意）

ドキュメントの品質が良ければ `chub feedback <id> up`、問題があれば `chub feedback <id> down` でフィードバックを送る。
