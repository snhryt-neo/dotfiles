from __future__ import annotations

import os
import tempfile
from pathlib import Path
from typing import Any

from .policy import CommandRunner, PolicyError, WorkspacePolicy, sha256_bytes
from .schemas import WorkerRequest


class ToolExecutor:
    def __init__(self, request: WorkerRequest):
        self.request = request
        self.policy = WorkspacePolicy(request)
        self.commands = CommandRunner(
            self.policy,
            request.commands,
            request.limits.max_tool_result_bytes,
        )
        self.file_operations: list[dict[str, Any]] = []
        self.checks: list[dict[str, Any]] = []

    def dispatch(self, name: str, args: dict[str, Any]) -> dict[str, Any]:
        handlers = {
            "list_files": self.list_files,
            "read_file": self.read_file,
            "write_file": self.write_file,
            "delete_file": self.delete_file,
            "run_check": self.run_check,
        }
        if name == "finish":
            raise PolicyError("finish must be handled by the runner")
        if name not in handlers:
            raise PolicyError(f"unknown tool: {name}")
        return handlers[name](**args)

    def list_files(self, path: str, recursive: bool = False, max_entries: int = 200) -> dict[str, Any]:
        if not 1 <= max_entries <= 1000:
            raise PolicyError("max_entries must be between 1 and 1000")
        target = self.policy.read_path(path)
        if not target.exists():
            raise PolicyError(f"path does not exist: {path}")
        if target.is_file():
            files = [target]
        elif recursive:
            files = [item for item in target.rglob("*") if not item.is_symlink()]
        else:
            files = [item for item in target.iterdir() if not item.is_symlink()]
        files = sorted(files, key=str)
        truncated = len(files) > max_entries
        files = files[:max_entries]
        return {
            "path": str(target),
            "entries": [str(item.relative_to(self.policy.workspace)) for item in files],
            "truncated": truncated,
        }

    def read_file(self, path: str, start_line: int | None = None, end_line: int | None = None) -> dict[str, Any]:
        target = self.policy.read_path(path)
        if not target.is_file():
            raise PolicyError(f"not a file: {path}")
        raw = target.read_bytes()
        if len(raw) > self.request.limits.max_file_bytes:
            raise PolicyError(f"file exceeds size limit: {path}")
        try:
            text = raw.decode("utf-8")
        except UnicodeDecodeError as exc:
            raise PolicyError(f"file is not UTF-8 text: {path}") from exc
        lines = text.splitlines(keepends=True)
        first = 1 if start_line is None else start_line
        last = len(lines) if end_line is None else end_line
        if first < 1 or last < first:
            raise PolicyError("invalid line range")
        selected = "".join(lines[first - 1 : last])
        return {
            "path": str(target.relative_to(self.policy.workspace)),
            "content": selected,
            "sha256": sha256_bytes(raw),
            "start_line": first,
            "end_line": min(last, len(lines)),
        }

    def write_file(self, path: str, content: str, expected_sha256: str | None = None) -> dict[str, Any]:
        target = self.policy.write_path(path)
        if "\x00" in content:
            raise PolicyError("NUL bytes are not allowed in file content")
        raw = content.encode("utf-8")
        if len(raw) > self.request.limits.max_file_bytes:
            raise PolicyError("content exceeds size limit")
        previous = target.read_bytes() if target.exists() else None
        if previous is not None and sha256_bytes(previous) != expected_sha256:
            raise PolicyError("expected_sha256 is required and does not match current content")
        if previous is None and expected_sha256 is not None:
            raise PolicyError("expected_sha256 must be omitted when creating a file")
        target.parent.mkdir(parents=True, exist_ok=True)
        mode = target.stat().st_mode if target.exists() else None
        with tempfile.NamedTemporaryFile(dir=target.parent, delete=False) as temporary:
            temporary.write(raw)
            temporary.flush()
            os.fsync(temporary.fileno())
            temporary_path = Path(temporary.name)
        try:
            if mode is not None:
                os.chmod(temporary_path, mode)
            os.replace(temporary_path, target)
        finally:
            temporary_path.unlink(missing_ok=True)
        operation = {
            "operation": "write_file",
            "path": str(target.relative_to(self.policy.workspace)),
            "sha256": sha256_bytes(raw),
            "created": previous is None,
        }
        self.file_operations.append(operation)
        return operation

    def delete_file(self, path: str, expected_sha256: str) -> dict[str, Any]:
        target = self.policy.write_path(path)
        if not target.is_file():
            raise PolicyError(f"not a file: {path}")
        raw = target.read_bytes()
        actual = sha256_bytes(raw)
        if actual != expected_sha256:
            raise PolicyError("expected_sha256 does not match current content")
        target.unlink()
        operation = {
            "operation": "delete_file",
            "path": str(target.relative_to(self.policy.workspace)),
            "sha256": actual,
        }
        self.file_operations.append(operation)
        return operation

    def run_check(self, check_id: str) -> dict[str, Any]:
        result = self.commands.run(check_id)
        self.checks.append(result)
        return result

    def run_required_checks(self) -> list[dict[str, Any]]:
        for check_id in self.request.required_checks:
            self.run_check(check_id)
        return self.checks
