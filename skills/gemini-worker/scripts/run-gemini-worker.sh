#!/usr/bin/env bash
set -euo pipefail

if ! command -v agy >/dev/null 2>&1; then
  printf 'gemini-worker: agyがインストールされていないか、PATHにありません\n' >&2
  exit 127
fi

if ! command -v jq >/dev/null 2>&1; then
  printf 'gemini-worker: jqがインストールされていないか、PATHにありません\n' >&2
  exit 127
fi

if [[ -t 0 ]]; then
  printf 'gemini-worker: 作業指示を標準入力から渡してください\n' >&2
  exit 2
fi

prompt=$(cat)
if [[ -z "$prompt" ]]; then
  printf 'gemini-worker: 作業指示が空です\n' >&2
  exit 2
fi

workspace_dir=$(pwd -P)
stream_file=$(mktemp "${TMPDIR:-/tmp}/gemini-worker-stream.XXXXXX")
error_file=$(mktemp "${TMPDIR:-/tmp}/gemini-worker-errors.XXXXXX")
trap 'rm -f "$stream_file" "$error_file"' EXIT

message=$(jq -cn --arg prompt "$prompt" '{event: "user", message: {content: $prompt}}')
if printf '%s\n' "$message" \
  | agy \
    --add-dir "$workspace_dir" \
    --model gemini-3.8-flash-high \
    --mode accept-edits \
    --input-format stream-json \
    --output-format stream-json \
    --print-timeout 10m \
    >"$stream_file" 2>"$error_file"; then
  agy_status=0
else
  agy_status=$?
fi

cat "$error_file" >&2
if grep -Eiq 'soft.?denied|auto-denied|no output produced|permission.{0,80}(denied|cannot prompt)' "$error_file"; then
  printf 'gemini-worker: agyが必要な操作を権限拒否したため、作業未完了として扱います\n' >&2
  exit 1
fi

if (( agy_status != 0 )); then
  exit "$agy_status"
fi

jq -er '
  select(.event == "result")
  | .result
  | if .status != "SUCCESS" then
      ("gemini-worker: agy returned \(.status): \(.error // "エラー詳細なし")" | halt_error(1))
    elif ((.response // "") | length) == 0 then
      ("gemini-worker: agyから空の応答が返りました" | halt_error(1))
    else .response
    end
' "$stream_file"
