---
name: imagegen
description: "Codex の組み込み image_gen ツール（gpt-image-2）で画像を生成し、カレントディレクトリに保存する。ユーザーが /imagegen <プロンプト> を実行したとき、または画像生成・画像作成を明示的に依頼したときに使う。API 呼び出しには非対応。"
---

# imagegen — 画像生成スキル

Codex から直接使う場合は、組み込みの `image_gen` ツールを呼び出して画像を生成し、カレントディレクトリに保存する。
Claude Code など `image_gen` を直接呼べない環境から使う場合だけ、`codex exec` 経由で Codex に委譲する。

## 入力形式

```bash
/imagegen <プロンプト> [--size WxH] [--quality low|medium|high|auto] [--output filename.png]
```

通常会話で「画像を生成して」と依頼された場合も同じルールで扱う。

| パラメータ | フラグ | デフォルト |
|-----------|--------|-----------|
| prompt | フラグなしの先頭テキスト全体 | 必須 |
| size | `--size` | 未指定時は必要なら確認 |
| quality | `--quality` | `medium` |
| output | `--output` | プロンプトから自動生成 |

## Step 1 — 引数をパース

`prompt`, `size`, `quality`, `output` を抽出する。`--output` 未指定時は、以下のルールで保存ファイル名を決める。

日本語プロンプト:
1. 内容を日本語のまま短く要約する（ローマ字変換しない）
2. スペース・記号をアンダースコアに変換し、ファイル名に使えない文字を除去する
3. 20文字以内に切り詰め、末尾に `.png` を付ける

英語プロンプト:
1. 小文字化し、空白・ハイフンをアンダースコアにする
2. 英数字・アンダースコア以外を除去する
3. 先頭・末尾のアンダースコアを除き、40文字以内に切り詰め、末尾に `.png` を付ける

例:
- `富士山と桜のポスター` → `富士山と桜.png`
- `猫のアイコン` → `猫アイコン.png`
- `a minimalist logo for a data engineering tool` → `a_minimalist_logo_for_a_data_engineering.png`

## Step 2 — 画像仕様を補完・確認

### サイズ検証

`--size` が指定されている場合、gpt-image-2 の制約を検証する。

| 制約 | 条件 |
|------|------|
| 16px の倍数 | 幅・高さそれぞれが 16 の倍数 |
| 最小ピクセル数 | 幅 × 高さ >= 655,360 |
| 最大ピクセル数 | 幅 × 高さ <= 8,294,400 |
| 長辺の上限 | max(幅, 高さ) <= 3840 |
| 縦横比 | max(幅, 高さ) / min(幅, 高さ) <= 3.0 |

違反がある場合は修正サイズを計算し、生成前にユーザーへ確認する。

- 各辺を最近傍の 16px 倍数に丸める（`round(x / 16) * 16`）
- 長辺が 3840 超なら、比率を保ってスケールダウンする
- 縦横比が 3:1 超なら、短辺を `ceil(長辺 / 3 / 16) * 16` に拡張する
- 修正後も総ピクセル数が範囲外なら、プリセット選択に切り替える

`--size` 未指定で確認が必要な場合は、1 回のメッセージで以下を提示する。

```text
画像サイズを選んでください:
1. 汎用（横長）         1280 x 720
2. アイコン/サムネイル   816 x 816
3. OGP/アイキャッチ     1200 x 624
4. フルHD（横長）       1920 x 1072
```

### 意図の補完

曖昧な指定は以下で補完する。

| 項目 | デフォルト |
|---|---|
| テイスト | clean, modern, high quality |
| 構図 | main subject centered, balanced composition |
| 背景 | simple background |
| 文字 | 原則なし |
| 人物 | 指定がなければ出さない |
| ブランドロゴ | 指定がなければ出さない |

以下に該当する場合だけ、生成前にまとめて確認する。

- テイスト候補が複数ありそう
- 文字入れの有無が成果物に大きく影響する
- 人物・顔・実在ブランド・ロゴが含まれる
- 透明背景を希望している
- 「いい感じに」「おしゃれに」など解釈幅が大きい

Codex CLI の `image_gen` では透明背景を保証できない。透明背景が必須なら、その制約を説明して代替案を確認する。

## Step 3 — 最終プロンプトを作る

Read ツールで `templates/prompt.md` を読み込み、確定した仕様を各プレースホルダーに埋めて英語プロンプトを構築する。

| プレースホルダー | 埋める内容 |
|---|---|
| `{{SUBJECT}}` | 画像の主題・被写体（英語） |
| `{{PURPOSE}}` | 用途（例: "tech architecture diagram for presentation slides"） |
| `{{STYLE}}` | テイスト（例: "clean flat illustration, Google Cloud color palette"） |
| `{{COMPOSITION}}` | 構図（例: "left-to-right flow, wide landscape layout"） |
| `{{BACKGROUND}}` | 背景（例: "white background"） |
| `{{TEXT}}` | 文字指示（デフォルト: "No text unless explicitly requested."） |
| `{{SIZE}}` | 確定したサイズ（例: "1280x720"） |
| `{{QUALITY}}` | 確定した品質（例: "medium"） |
| `{{CONSTRAINTS}}` | 禁止事項。指定がなければ "Do not include logos, watermarks, or extra text. Keep the composition clean and suitable for the intended use." |

埋めた結果を `FILLED_PROMPT` として使う。

## Step 4 — Codex で直接生成する

Codex 環境で `image_gen` ツールが使える場合は、`FILLED_PROMPT` を渡して直接画像を生成する。生成後、ツールが返す画像ファイルまたは生成済み画像を `OUTPUT_FILENAME` としてカレントディレクトリに保存する。

実行時の注意:
- `image_gen` には最終的な英語プロンプト、サイズ、品質を渡す
- 保存先は `pwd` で取得したカレントディレクトリ
- 既存ファイルと同名になる場合は、上書き前に確認するか、`_2` などの連番を付ける
- 生成に失敗した場合は、失敗理由と再実行に必要な修正点を日本語で説明する

## Step 5 — Claude Code 経由の場合

Claude Code など `image_gen` を直接呼べない環境では、同じ `FILLED_PROMPT` を使って Codex CLI に委譲する。

```bash
TARGET_DIR=$(pwd)
codex exec \
  --full-auto \
  --skip-git-repo-check \
  --cd "$TARGET_DIR" \
  "Use the built-in image_gen tool to generate an image with these specifications:
FILLED_PROMPT

After generating, save the image as: TARGET_DIR/OUTPUT_FILENAME
Report the final file path when complete."
```

`--full-auto` は確認プロンプトなしで自動実行するためのフラグ。`--skip-git-repo-check` は Git リポジトリ外でも動作させるため。

## Step 6 — 結果を日本語で報告

成功時:

```text
画像を保存しました
パス: TARGET_DIR/OUTPUT_FILENAME
サイズ: SIZE / 品質: QUALITY
プロンプト: PROMPT（原文）
最終プロンプト: FILLED_PROMPT
```

失敗時は、エラー内容と次に試すべき修正を説明する。
