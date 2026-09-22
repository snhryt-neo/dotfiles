from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from pydantic import ValidationError

from . import __version__
from .runner import GeminiWorker
from .schemas import WorkerRequest, WorkerResult


EXIT_CODES = {"completed": 0, "blocked": 3, "failed": 4}


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Run a constrained Vertex AI Gemini worker")
    parser.add_argument("--version", action="version", version=__version__)
    subparsers = parser.add_subparsers(dest="command", required=True)
    run = subparsers.add_parser("run", help="run a task request")
    run.add_argument("--request", default="-", help="request JSON path, or - for stdin")
    return parser


def _read_request(path: str) -> WorkerRequest:
    raw = sys.stdin.read() if path == "-" else Path(path).read_text(encoding="utf-8")
    return WorkerRequest.model_validate(json.loads(raw))


def _emit(result: WorkerResult) -> None:
    print(result.model_dump_json(ensure_ascii=False))


def main(argv: list[str] | None = None) -> int:
    args = _parser().parse_args(argv)
    if args.command != "run":
        return 2
    try:
        request = _read_request(args.request)
    except (OSError, json.JSONDecodeError, ValidationError) as exc:
        _emit(
            WorkerResult(
                status="failed",
                summary="request is invalid",
                error={"code": "invalid_request", "message": str(exc)},
            )
        )
        return 2
    try:
        result = GeminiWorker(request).run()
    except Exception as exc:  # CLIは必ず機械可読な結果を返す。
        result = WorkerResult(
            status="failed",
            summary="worker execution failed",
            error={"code": "worker_error", "message": str(exc)},
        )
    _emit(result)
    return EXIT_CODES[result.status]


if __name__ == "__main__":
    raise SystemExit(main())
