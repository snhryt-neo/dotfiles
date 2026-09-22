from __future__ import annotations

import sys
from types import SimpleNamespace

from gemini_worker import runner
from gemini_worker.schemas import CommandSpec, WorkerRequest


class FakeClient:
    def __init__(self, responses):
        self.models = SimpleNamespace(generate_content=lambda **_: responses.pop(0))


def response_for(name, args):
    function_call = SimpleNamespace(name=name, args=args)
    part = SimpleNamespace(function_call=function_call)
    content = SimpleNamespace(parts=[part])
    return SimpleNamespace(candidates=[SimpleNamespace(content=content)], usage_metadata=None)


def test_runner_keeps_tool_scope_and_runs_required_check(tmp_path, monkeypatch):
    request = WorkerRequest(
        task_id="runner-test",
        workspace=str(tmp_path),
        instructions="create a file",
        read_paths=["."],
        write_paths=["."],
        commands={"test": CommandSpec(argv=[sys.executable, "-c", "pass"])},
        required_checks=["test"],
    )
    responses = [
        response_for("write_file", {"path": "result.txt", "content": "done"}),
        response_for("finish", {"status": "completed", "summary": "created"}),
    ]
    monkeypatch.setenv("GOOGLE_CLOUD_PROJECT", "test-project")
    monkeypatch.setenv("GOOGLE_CLOUD_LOCATION", "global")
    monkeypatch.setenv("GOOGLE_GENAI_USE_VERTEXAI", "true")
    monkeypatch.delenv("GOOGLE_API_KEY", raising=False)
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    monkeypatch.setattr(runner, "build_client", lambda _: FakeClient(responses))

    result = runner.GeminiWorker(request).run()

    assert result.status == "completed"
    assert (tmp_path / "result.txt").read_text(encoding="utf-8") == "done"
    assert result.checks[0]["check_id"] == "test"
