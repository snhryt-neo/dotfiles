from __future__ import annotations

import json

from gemini_worker.cli import main


def test_invalid_request_is_machine_readable(capsys):
    exit_code = main(["run", "--request", "-"])
    captured = capsys.readouterr()
    result = json.loads(captured.out)
    assert exit_code == 2
    assert result["error"]["code"] == "invalid_request"
