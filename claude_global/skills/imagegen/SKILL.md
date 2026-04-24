---
name: imagegen
description: "Codex CLI の組み込み image_gen ツール（gpt-image-2）を使って画像を生成し、カレントディレクトリに保存する。ユーザーが /imagegen <プロンプト> を実行したとき、または「画像を生成して」のように画像生成を明示的に依頼したときにこのスキルを使う。API 呼び出しには非対応"
---

# imagegen — 画像生成スキル

`codex exec` で Codex CLI の組み込み `image_gen` ツールを呼び出し、生成画像をカレントディレクトリに保存する。

## 引数の書式

```
/imagegen <プロンプト> [--size WxH] [--quality low|medium|high|auto] [--output filename.png]
```

引数は `ARGUMENTS:` セクション（または会話末尾のユーザー入力）として渡される。

## Step 1 — 引数をパース

| パラメータ | フラグ | デフォルト |
|-----------|--------|-----------|
| prompt | フラグなしの先頭テキスト全体 | 必須 |
| size | `--size` | 未指定時は Step 2 で確認 |
| quality | `--quality` | `medium` |
| output | `--output` | 以下ルールで自動生成 |

**ファイル名の自動生成**（`--output` 未指定時）:

プロンプトが**日本語**の場合:
1. プロンプトの内容を日本語のまま短くサマリーした文字列を使う（ローマ字変換不要）
2. スペース・記号をアンダースコアに変換、ファイル名に使えない文字を除去
3. 20文字以内に切り詰め、末尾に `.png` を付与

プロンプトが**英語**の場合:
1. 小文字化 → 空白・ハイフン→アンダースコア → 英数字・アンダースコア以外を除去
2. 先頭・末尾のアンダースコアを削除、40文字以内に切り詰め、末尾に `.png` を付与

例:
- `富士山と桜のポスター` → `富士山と桜.png`
- `猫のアイコン` → `猫アイコン.png`
- `a minimalist logo for a data engineering tool` → `a_minimalist_logo_for_a_data_engineering.png`
- `dashboard mockup for BigQuery monitoring` → `dashboard_mockup_for_bigquery_monitoring.png`

## Step 2 — 画像仕様の補完・確認

**1 回のメッセージにまとめて**ユーザーに問い合わせる。

### 2.0 サイズ前処理（--size 指定時のみ）

`--size` が指定されている場合、gpt-image-2 の制約を検証する:

| 制約 | 条件 |
|------|------|
| 16px の倍数 | 幅・高さそれぞれが 16 の倍数 |
| 最小ピクセル数 | 幅 × 高さ ≥ 655,360 |
| 最大ピクセル数 | 幅 × 高さ ≤ 8,294,400 |
| 長辺の上限 | max(幅, 高さ) ≤ 3840 |
| 縦横比 | max(幅, 高さ) / min(幅, 高さ) ≤ 3.0 |

違反がある場合は修正サイズを計算して Step 2.3 の確認メッセージに含める:
- 各辺を最近傍の 16px 倍数に丸める（`round(x / 16) * 16`）
- 長辺が 3840 超: 比率を保ちつつスケールダウン
- 縦横比が 3:1 超: 短辺を `ceil(長辺 / 3 / 16) * 16` に拡張
- 修正後も総ピクセル数が範囲外（655,360 未満 or 8,294,400 超）の場合: 近似困難とみなし、Step 2.3 でプリセット選択に切り替える

有効なサイズの場合はそのままサイズ確定とし、Step 2.3 のサイズ欄は省略する。

### 2.1 プロンプトの意図を分類

| 項目 | 例 |
|---|---|
| 用途 | アイコン、OGP、ポスター、SNS投稿、スライド挿絵、UIモック、壁紙、構成図 |
| 主題 | 人物、動物、風景、商品、図解、抽象表現 |
| テイスト | 写実、ミニマル、アニメ調、フラットイラスト、3D、手描き、水彩、サイバーパンク |
| 構図 | 正面、俯瞰、横長、中央配置、余白多め、クローズアップ |
| 文字入れ | あり / なし |
| 背景 | 単色、透明希望、自然背景、オフィス、抽象背景 |
| 禁止事項 | ロゴなし、文字なし、人物なし、過度な装飾なし |

Codex CLI では画像の透過ができないため、ユーザー要望があっても無視する（API 利用の上で `gpt-image-1.5` + `--background transparent` が必要）

### 2.2 不足情報の自動補完

ユーザーの指定が曖昧な場合、以下のデフォルトを使う:

| 項目 | デフォルト |
|---|---|
| テイスト | clean, modern, high quality |
| 構図 | main subject centered, balanced composition |
| 背景 | simple background |
| 文字 | 原則なし |
| 人物 | 指定がなければ出さない |
| ブランドロゴ | 指定がなければ出さない |

### 2.3 確認メッセージ（1 回にまとめる）

**サイズ欄**（以下の場合のみ含める）:
- `--size` 未指定、または 2.0 で近似困難と判定: プリセット 4 択を提示
- `--size` 指定済みで制約違反: 違反内容と修正サイズを示し、続行か変更かを確認

```
画像サイズを選んでください:
1. 汎用（横長）         1280 × 720
2. アイコン/サムネイル   816 × 816
3. OGP/アイキャッチ     1200 × 624
4. フルHD（横長）       1920 × 1072
```

**意図確認欄**（以下のいずれかに該当する場合のみ追加する）:
- テイスト候補が複数ありそうな場合
- 文字入れの有無が成果物に大きく影響する場合
- 人物・顔・実在ブランド・ロゴが含まれる場合
- 透明背景を希望している場合
- 「いい感じに」「おしゃれに」など、解釈幅が大きい場合

確認メッセージ例:
```
生成前に確認させてください。

サイズ:
1. 汎用（横長）         1280 × 720
2. アイコン/サムネイル   816 × 816
3. OGP/アイキャッチ     1200 × 624
4. フルHD（横長）       1920 × 1072

テイスト: ミニマル / フラットイラスト / 写実 / 3D
文字入れ: あり / なし

未指定のままなら [デフォルト設定] で進めます。
```

## Step 3 — プロンプトテンプレートを埋める

Read ツールで `templates/prompt.md` を読み込み、Step 1〜2 で確定した仕様を各プレースホルダーに埋めて英語プロンプトを構築する。

| プレースホルダー | 埋める内容 |
|---|---|
| `{{SUBJECT}}` | 画像の主題・被写体（英語） |
| `{{PURPOSE}}` | 用途（例: "tech architecture diagram for presentation slides"） |
| `{{STYLE}}` | テイスト（例: "clean flat illustration, Google Cloud color palette"） |
| `{{COMPOSITION}}` | 構図（例: "left-to-right flow, wide landscape layout"） |
| `{{BACKGROUND}}` | 背景（例: "white background" / "transparent"） |
| `{{TEXT}}` | 文字指示（デフォルト: "No text unless explicitly requested."） |
| `{{SIZE}}` | 確定したサイズ（例: "1280x720"） |
| `{{QUALITY}}` | 確定した品質（例: "medium"） |
| `{{CONSTRAINTS}}` | 禁止事項（デフォルト: "Do not include logos, watermarks, or extra text. Keep the composition clean and suitable for the intended use." に追加制約があれば付け加える） |

埋めた結果を `FILLED_PROMPT` として以降の手順で使う。

## Step 4 — 現在のディレクトリを取得

```bash
pwd
```

取得した絶対パスを `TARGET_DIR` として以降の手順で使う。

## Step 5 — codex exec で画像を生成

以下のコマンドを実行する（各変数は Step 1〜4 の実際の値に置き換える）:

```bash
codex exec \
  --full-auto \
  --skip-git-repo-check \
  --cd "TARGET_DIR" \
  "Use the built-in image_gen tool to generate an image with these specifications:
FILLED_PROMPT

After generating, move or copy the newest image file from ~/.codex/generated_images/ to: TARGET_DIR/OUTPUT_FILENAME
Report the final file path when complete."
```

`--full-auto` は確認プロンプトなしで自動実行するフラグ。`--skip-git-repo-check` は Git リポジトリ外でも動作させるため。

## Step 6 — 結果を日本語で報告

成功時:
```
✓ 画像を保存しました
  パス: TARGET_DIR/OUTPUT_FILENAME
  サイズ: SIZE / 品質: QUALITY
  プロンプト: PROMPT（原文）
  最終プロンプト: FILLED_PROMPT（Codex に渡したもの）
```

失敗時はエラー内容と対処法を説明する。
