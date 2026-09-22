from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator


class CommandSpec(BaseModel):
    model_config = ConfigDict(extra="forbid")

    argv: list[str] = Field(min_length=1)
    cwd: str | None = None
    timeout_seconds: float = Field(default=120.0, gt=0, le=600)

    @field_validator("argv")
    @classmethod
    def validate_argv(cls, value: list[str]) -> list[str]:
        if any(not item or "\x00" in item for item in value):
            raise ValueError("argv must not contain empty values or NUL bytes")
        return value


class Limits(BaseModel):
    model_config = ConfigDict(extra="forbid")

    max_tool_calls: int = Field(default=30, ge=1, le=100)
    max_runtime_seconds: float = Field(default=1200.0, gt=0, le=3600)
    api_timeout_seconds: float = Field(default=120.0, gt=0, le=600)
    max_output_tokens: int = Field(default=16384, ge=256, le=65536)
    max_tool_result_bytes: int = Field(default=65536, ge=1024, le=1048576)
    max_file_bytes: int = Field(default=1048576, ge=1024, le=10485760)


class WorkerRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    schema_version: Literal[1] = 1
    task_id: str = Field(min_length=1, max_length=200)
    workspace: str = Field(min_length=1)
    instructions: str = Field(min_length=1)
    context: str = ""
    read_paths: list[str] = Field(default_factory=list)
    write_paths: list[str] = Field(default_factory=list)
    commands: dict[str, CommandSpec] = Field(default_factory=dict)
    required_checks: list[str] = Field(default_factory=list)
    limits: Limits = Field(default_factory=Limits)

    @field_validator("task_id", "workspace", "instructions")
    @classmethod
    def reject_nul(cls, value: str) -> str:
        if "\x00" in value:
            raise ValueError("NUL bytes are not allowed")
        return value


class FinishRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    status: Literal["completed", "blocked", "failed"]
    summary: str = Field(min_length=1, max_length=10000)
    error: str | None = Field(default=None, max_length=5000)


class Usage(BaseModel):
    model_config = ConfigDict(extra="forbid")

    prompt_tokens: int | None = None
    candidates_tokens: int | None = None
    thoughts_tokens: int | None = None
    total_tokens: int | None = None


class WorkerResult(BaseModel):
    model_config = ConfigDict(extra="forbid")

    status: Literal["completed", "blocked", "failed"]
    summary: str
    file_operations: list[dict[str, Any]] = Field(default_factory=list)
    checks: list[dict[str, Any]] = Field(default_factory=list)
    usage: Usage = Field(default_factory=Usage)
    error: dict[str, str] | None = None
