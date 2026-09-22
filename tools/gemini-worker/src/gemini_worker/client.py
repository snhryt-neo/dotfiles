from __future__ import annotations

import os

from google import genai
from google.genai import types

from .schemas import WorkerRequest

MODEL_ID = "gemini-3.8-flash"


class ClientConfigurationError(ValueError):
    """Vertex AIクライアントの設定が不足している。"""


def build_client(request: WorkerRequest):
    project = os.environ.get("GOOGLE_CLOUD_PROJECT")
    location = os.environ.get("GOOGLE_CLOUD_LOCATION")
    use_vertexai = os.environ.get("GOOGLE_GENAI_USE_VERTEXAI", "").lower()
    if not project:
        raise ClientConfigurationError("GOOGLE_CLOUD_PROJECT is required")
    if not location:
        raise ClientConfigurationError("GOOGLE_CLOUD_LOCATION is required")
    if use_vertexai not in {"1", "true"}:
        raise ClientConfigurationError("GOOGLE_GENAI_USE_VERTEXAI must be true or 1")
    if os.environ.get("GOOGLE_API_KEY") or os.environ.get("GEMINI_API_KEY"):
        raise ClientConfigurationError("API key authentication is not supported; use ADC")
    http_options = types.HttpOptions(
        timeout=int(request.limits.api_timeout_seconds * 1000),
        retry_options=types.HttpRetryOptions(attempts=1),
    )
    return genai.Client(
        vertexai=True,
        project=project,
        location=location,
        http_options=http_options,
    )
