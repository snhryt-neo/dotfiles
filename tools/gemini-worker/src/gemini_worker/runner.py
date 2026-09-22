from __future__ import annotations

import json
import time
from typing import Any

from google.genai import types
from pydantic import ValidationError

from .client import MODEL_ID, build_client
from .policy import PolicyError
from .schemas import FinishRequest, Usage, WorkerRequest, WorkerResult
from .tools import ToolExecutor


SYSTEM_INSTRUCTION = """あなたはCodexが具体化した作業指示を実行する、制約付きの実装ワーカーです。
作業の計画を作り直したり、指示書にないファイルやコマンドを使ったりしないでください。
読み取り・書き込み・検証は必ず提供されたツールを使い、自由文だけで完了を報告せず、最後にfinishを呼び出してください。
ファイルを書き換えるときは、先にread_fileで現在内容とsha256を取得し、その値をexpected_sha256に渡してください。
検証コマンドはrun_checkで指定されたcheck_idだけを実行してください。
"""


def tool_declarations() -> list[types.FunctionDeclaration]:
    return [
        types.FunctionDeclaration(
            name="list_files",
            description="許可された範囲のファイル一覧を取得する。",
            parameters_json_schema={
                "type": "object",
                "properties": {
                    "path": {"type": "string"},
                    "recursive": {"type": "boolean"},
                    "max_entries": {"type": "integer", "minimum": 1, "maximum": 1000},
                },
                "required": ["path"],
            },
        ),
        types.FunctionDeclaration(
            name="read_file",
            description="許可されたUTF-8テキストファイルを読む。",
            parameters_json_schema={
                "type": "object",
                "properties": {
                    "path": {"type": "string"},
                    "start_line": {"type": "integer", "minimum": 1},
                    "end_line": {"type": "integer", "minimum": 1},
                },
                "required": ["path"],
            },
        ),
        types.FunctionDeclaration(
            name="write_file",
            description="許可されたテキストファイルを原子的に作成または更新する。",
            parameters_json_schema={
                "type": "object",
                "properties": {
                    "path": {"type": "string"},
                    "content": {"type": "string"},
                    "expected_sha256": {"type": "string"},
                },
                "required": ["path", "content"],
            },
        ),
        types.FunctionDeclaration(
            name="delete_file",
            description="許可された通常ファイルをsha256確認後に削除する。",
            parameters_json_schema={
                "type": "object",
                "properties": {
                    "path": {"type": "string"},
                    "expected_sha256": {"type": "string"},
                },
                "required": ["path", "expected_sha256"],
            },
        ),
        types.FunctionDeclaration(
            name="run_check",
            description="作業指示書で定義された検証コマンドをIDで実行する。",
            parameters_json_schema={
                "type": "object",
                "properties": {"check_id": {"type": "string"}},
                "required": ["check_id"],
            },
        ),
        types.FunctionDeclaration(
            name="finish",
            description="作業の最終状態を報告する。",
            parameters_json_schema={
                "type": "object",
                "properties": {
                    "status": {"type": "string", "enum": ["completed", "blocked", "failed"]},
                    "summary": {"type": "string"},
                    "error": {"type": "string"},
                },
                "required": ["status", "summary"],
            },
        ),
    ]


class GeminiWorker:
    def __init__(self, request: WorkerRequest):
        self.request = request
        self.executor = ToolExecutor(request)
        self.usage = Usage()
        self.started_at = time.monotonic()

    def run(self) -> WorkerResult:
        client = build_client(self.request)
        contents: list[types.Content] = [
            types.Content(
                role="user",
                parts=[types.Part.from_text(text=self._initial_prompt())],
            )
        ]
        config = types.GenerateContentConfig(
            system_instruction=SYSTEM_INSTRUCTION,
            tools=[types.Tool(function_declarations=tool_declarations())],
            automatic_function_calling=types.AutomaticFunctionCallingConfig(disable=True),
            thinking_config=types.ThinkingConfig(thinking_level=types.ThinkingLevel.HIGH),
            max_output_tokens=self.request.limits.max_output_tokens,
        )

        tool_call_count = 0
        for _ in range(self.request.limits.max_tool_calls):
            if time.monotonic() - self.started_at > self.request.limits.max_runtime_seconds:
                return self._result("failed", "worker runtime limit reached", "runtime_limit")
            try:
                response = self._generate(client, contents, config)
            except Exception as exc:
                return self._result("failed", "Gemini request failed", "api_error", str(exc))
            self._record_usage(response)
            try:
                candidate = self._candidate(response)
            except RuntimeError as exc:
                return self._result("failed", str(exc), "invalid_response")
            if candidate.content is not None:
                # function callとthought signatureを含むContentをそのまま再送する。
                contents.append(candidate.content)
            calls = self._function_calls(candidate)
            if not calls:
                contents.append(
                    types.Content(
                        role="user",
                        parts=[types.Part.from_text(text="ツールを使って作業を続け、最後にfinishを呼び出してください。")],
                    )
                )
                continue
            tool_call_count += len(calls)
            if tool_call_count > self.request.limits.max_tool_calls:
                return self._result("failed", "tool call limit reached", "tool_call_limit")
            finish_calls = [call for call in calls if call.name == "finish"]
            if finish_calls and len(calls) != 1:
                return self._result("failed", "finish cannot be combined with another tool call", "invalid_tool_sequence")
            if finish_calls:
                result = self._handle_finish(finish_calls[0], contents)
                if result is not None:
                    return result
                continue

            parts: list[types.Part] = []
            for call in calls:
                try:
                    result = self.executor.dispatch(call.name, dict(call.args or {}))
                except (OSError, PolicyError, TypeError, ValueError) as exc:
                    result = {"error": str(exc)}
                parts.append(types.Part.from_function_response(name=call.name, response={"result": result}))
            contents.append(types.Content(role="tool", parts=parts))
        return self._result("failed", "tool call limit reached", "tool_call_limit")

    def _initial_prompt(self) -> str:
        return json.dumps(
            {
                "task_id": self.request.task_id,
                "workspace": self.request.workspace,
                "instructions": self.request.instructions,
                "context": self.request.context,
                "read_paths": self.request.read_paths,
                "write_paths": self.request.write_paths,
                "commands": {key: value.model_dump(mode="json") for key, value in self.request.commands.items()},
                "required_checks": self.request.required_checks,
            },
            ensure_ascii=False,
            indent=2,
            default=str,
        )

    def _generate(self, client: Any, contents: list[types.Content], config: types.GenerateContentConfig):
        last_error: Exception | None = None
        for attempt in range(3):
            try:
                return client.models.generate_content(model=MODEL_ID, contents=contents, config=config)
            except Exception as exc:  # SDKの例外型はバージョン差があるため文字列で分類する。
                last_error = exc
                message = str(exc)
                retryable = any(token in message for token in ("429", "500", "502", "503", "504", "UNAVAILABLE"))
                if not retryable or attempt == 2:
                    raise
                time.sleep(2**attempt)
        raise RuntimeError(str(last_error))

    @staticmethod
    def _candidate(response: Any) -> Any:
        candidates = getattr(response, "candidates", None) or []
        if not candidates:
            raise RuntimeError("Gemini response did not contain a candidate")
        return candidates[0]

    @staticmethod
    def _function_calls(candidate: Any) -> list[Any]:
        content = getattr(candidate, "content", None)
        parts = getattr(content, "parts", None) or []
        return [part.function_call for part in parts if getattr(part, "function_call", None) is not None]

    def _handle_finish(self, call: Any, contents: list[types.Content]) -> WorkerResult | None:
        try:
            finish = FinishRequest.model_validate(dict(call.args or {}))
        except ValidationError as exc:
            return self._result("failed", "finish arguments are invalid", "invalid_finish", str(exc))
        if finish.status != "completed":
            code = "worker_blocked" if finish.status == "blocked" else "worker_reported_failure"
            return self._result(finish.status, finish.summary, code, finish.error)
        try:
            checks = self.executor.run_required_checks()
        except (PolicyError, OSError, ValueError) as exc:
            checks = self.executor.checks
            contents.append(
                types.Content(
                    role="tool",
                    parts=[types.Part.from_function_response(name="finish", response={"result": {"error": str(exc), "checks": checks}})],
                )
            )
            contents.append(
                types.Content(
                    role="user",
                    parts=[types.Part.from_text(text="必須検証に失敗しました。原因を修正してから、再度finishを呼び出してください。")],
                )
            )
            return None
        failed = [check for check in checks if check.get("returncode") != 0 or check.get("timed_out")]
        if failed:
            contents.append(
                types.Content(
                    role="tool",
                    parts=[types.Part.from_function_response(name="finish", response={"result": {"checks": checks}})],
                )
            )
            contents.append(
                types.Content(
                    role="user",
                    parts=[types.Part.from_text(text="必須検証が失敗しました。原因を修正してから、再度finishを呼び出してください。")],
                )
            )
            return None
        return self._result("completed", finish.summary, finish.error)

    def _record_usage(self, response: Any) -> None:
        metadata = getattr(response, "usage_metadata", None)
        if metadata is None:
            return

        def add(previous: int | None, current: int | None) -> int | None:
            if previous is None:
                return current
            if current is None:
                return previous
            return previous + current

        self.usage = Usage(
            prompt_tokens=add(self.usage.prompt_tokens, getattr(metadata, "prompt_token_count", None)),
            candidates_tokens=add(self.usage.candidates_tokens, getattr(metadata, "candidates_token_count", None)),
            thoughts_tokens=add(self.usage.thoughts_tokens, getattr(metadata, "thoughts_token_count", None)),
            total_tokens=add(self.usage.total_tokens, getattr(metadata, "total_token_count", None)),
        )

    def _result(self, status: str, summary: str, error: str | None = None, detail: str | None = None) -> WorkerResult:
        error_data = None
        if error:
            error_data = {"code": error, "message": detail or summary}
        return WorkerResult(
            status=status,  # type: ignore[arg-type]
            summary=summary,
            file_operations=self.executor.file_operations,
            checks=self.executor.checks,
            usage=self.usage,
            error=error_data,
        )
