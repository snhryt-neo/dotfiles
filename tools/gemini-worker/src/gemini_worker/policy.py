from __future__ import annotations

import hashlib
import os
import subprocess
from pathlib import Path
from typing import Iterable

from .schemas import CommandSpec, WorkerRequest


class PolicyError(ValueError):
    """操作が作業指示書の権限範囲に入っていない。"""


def sha256_bytes(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


class WorkspacePolicy:
    def __init__(self, request: WorkerRequest):
        self.workspace = self._resolve_workspace(request.workspace)
        self.read_roots = self._resolve_roots(request.read_paths, "read")
        self.write_roots = self._resolve_roots(request.write_paths, "write")

    def _resolve_workspace(self, value: str) -> Path:
        workspace = Path(value).expanduser().resolve()
        if not workspace.is_dir():
            raise PolicyError(f"workspace is not a directory: {value}")
        if (workspace / ".git").exists() and (workspace / ".git").is_dir():
            # リポジトリのルート自体は許可するが、.gitは後段で拒否する。
            return workspace
        return workspace

    def _resolve_roots(self, values: Iterable[str], operation: str) -> list[Path]:
        roots: list[Path] = []
        for value in values:
            path = self._resolve_under_workspace(value)
            if path.exists() and path.is_file() and operation == "write":
                roots.append(path)
            elif path.exists() and not path.is_dir() and not path.is_file():
                raise PolicyError(f"unsupported {operation} path: {value}")
            else:
                roots.append(path)
        return roots

    def _resolve_under_workspace(self, value: str) -> Path:
        raw = Path(value).expanduser()
        candidate = raw if raw.is_absolute() else self.workspace / raw
        resolved = candidate.resolve(strict=False)
        if not self._is_within(resolved, self.workspace):
            raise PolicyError(f"path is outside workspace: {value}")
        if ".git" in resolved.relative_to(self.workspace).parts:
            raise PolicyError(".git is not an allowed path")
        self._reject_symlink_components(candidate)
        return resolved

    def _reject_symlink_components(self, candidate: Path) -> None:
        current = candidate if candidate.is_absolute() else self.workspace / candidate
        try:
            relative = current.relative_to(self.workspace)
        except ValueError as exc:
            raise PolicyError(f"path is outside workspace: {candidate}") from exc
        cursor = self.workspace
        for part in relative.parts:
            cursor /= part
            if cursor.is_symlink():
                raise PolicyError(f"symlink paths are not allowed: {candidate}")

    @staticmethod
    def _is_within(path: Path, root: Path) -> bool:
        try:
            path.relative_to(root)
        except ValueError:
            return False
        return True

    def _allowed(self, path: Path, roots: list[Path]) -> bool:
        return any(path == root or self._is_within(path, root) for root in roots)

    def read_path(self, value: str) -> Path:
        path = self._resolve_under_workspace(value)
        if not self._allowed(path, self.read_roots):
            raise PolicyError(f"read access is not allowed: {value}")
        return path

    def write_path(self, value: str) -> Path:
        path = self._resolve_under_workspace(value)
        if not self._allowed(path, self.write_roots):
            raise PolicyError(f"write access is not allowed: {value}")
        if path.exists() and path.is_dir():
            raise PolicyError(f"a directory cannot be written as a file: {value}")
        return path

    def command_cwd(self, value: str | None) -> Path:
        path = self._resolve_under_workspace(value or ".")
        if not path.is_dir():
            raise PolicyError(f"command cwd is not a directory: {value or self.workspace}")
        return path


class CommandRunner:
    def __init__(self, policy: WorkspacePolicy, commands: dict[str, CommandSpec], output_limit: int):
        self.policy = policy
        self.commands = commands
        self.output_limit = output_limit

    def run(self, check_id: str) -> dict[str, object]:
        if check_id not in self.commands:
            raise PolicyError(f"unknown command id: {check_id}")
        spec = self.commands[check_id]
        cwd = self.policy.command_cwd(spec.cwd)
        process = subprocess.Popen(
            spec.argv,
            cwd=cwd,
            stdin=subprocess.DEVNULL,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            start_new_session=True,
        )
        try:
            output, _ = process.communicate(timeout=spec.timeout_seconds)
            timed_out = False
        except subprocess.TimeoutExpired:
            try:
                os.killpg(process.pid, 9)
            except ProcessLookupError:
                pass
            output, _ = process.communicate()
            timed_out = True
        output = output or ""
        truncated = len(output.encode()) > self.output_limit
        if truncated:
            output = output.encode()[: self.output_limit].decode("utf-8", errors="replace")
        return {
            "check_id": check_id,
            "argv": spec.argv,
            "cwd": str(cwd),
            "returncode": process.returncode,
            "timed_out": timed_out,
            "truncated": truncated,
            "output": output,
        }
