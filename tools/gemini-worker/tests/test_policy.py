from __future__ import annotations

import sys

import pytest

from gemini_worker.policy import CommandRunner, PolicyError, WorkspacePolicy, sha256_bytes
from gemini_worker.schemas import CommandSpec, WorkerRequest
from gemini_worker.tools import ToolExecutor


def request_for(workspace, **kwargs):
    values = {
        "task_id": "test",
        "workspace": str(workspace),
        "instructions": "test",
        "read_paths": ["."],
        "write_paths": ["."],
    }
    values.update(kwargs)
    return WorkerRequest.model_validate(values)


def test_path_outside_workspace_is_rejected(tmp_path):
    policy = WorkspacePolicy(request_for(tmp_path))
    with pytest.raises(PolicyError):
        policy.read_path("../outside")


def test_git_is_rejected(tmp_path):
    (tmp_path / ".git").mkdir()
    policy = WorkspacePolicy(request_for(tmp_path))
    with pytest.raises(PolicyError):
        policy.read_path(".git/config")


def test_write_requires_current_hash(tmp_path):
    target = tmp_path / "note.txt"
    target.write_text("before", encoding="utf-8")
    executor = ToolExecutor(request_for(tmp_path))
    with pytest.raises(PolicyError):
        executor.write_file("note.txt", "after")
    result = executor.write_file("note.txt", "after", sha256_bytes(b"before"))
    assert result["created"] is False
    assert target.read_text(encoding="utf-8") == "after"


def test_symlink_is_rejected(tmp_path):
    target = tmp_path / "real.txt"
    target.write_text("content", encoding="utf-8")
    (tmp_path / "link.txt").symlink_to(target)
    policy = WorkspacePolicy(request_for(tmp_path))
    with pytest.raises(PolicyError):
        policy.read_path("link.txt")


def test_command_runner_uses_declared_command(tmp_path):
    request = request_for(
        tmp_path,
        commands={
            "check": CommandSpec(argv=[sys.executable, "-c", "print('ok')"]),
        },
    )
    runner = CommandRunner(WorkspacePolicy(request), request.commands, 1024)
    result = runner.run("check")
    assert result["returncode"] == 0
    assert result["output"].strip() == "ok"


def test_write_file_with_stale_hash_is_rejected(tmp_path):
    target = tmp_path / "stale_write.txt"
    target.write_text("initial content", encoding="utf-8")
    executor = ToolExecutor(request_for(tmp_path))
    read_result = executor.read_file("stale_write.txt")
    stale_sha256 = read_result["sha256"]

    target.write_text("modified content", encoding="utf-8")

    with pytest.raises(PolicyError):
        executor.write_file("stale_write.txt", "overwritten content", stale_sha256)

    assert target.exists()
    assert target.read_text(encoding="utf-8") == "modified content"


def test_delete_file_with_stale_hash_is_rejected(tmp_path):
    target = tmp_path / "stale_delete.txt"
    target.write_text("initial content", encoding="utf-8")
    executor = ToolExecutor(request_for(tmp_path))
    read_result = executor.read_file("stale_delete.txt")
    stale_sha256 = read_result["sha256"]

    target.write_text("modified content", encoding="utf-8")

    with pytest.raises(PolicyError):
        executor.delete_file("stale_delete.txt", stale_sha256)

    assert target.exists()
    assert target.read_text(encoding="utf-8") == "modified content"
