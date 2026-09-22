from __future__ import annotations

import os
from pathlib import Path

from google import genai
from google.genai import types
from google.oauth2.credentials import Credentials

from .schemas import WorkerRequest

MODEL_ID = "gemini-3.8-flash"


class ClientConfigurationError(ValueError):
    """Vertex AIクライアントの設定が不足している。"""


def build_client(request: WorkerRequest):
    if os.environ.get("GOOGLE_API_KEY") or os.environ.get("GEMINI_API_KEY"):
        raise ClientConfigurationError("API key authentication is not supported; use ADC")
    adc_path = Path.home() / ".config/gcloud/application_default_credentials.json"
    try:
        credentials = Credentials.from_authorized_user_file(
            str(adc_path), scopes=["https://www.googleapis.com/auth/cloud-platform"]
        )
    except (OSError, ValueError):
        # SDKの例外に認証情報が含まれる可能性があるため、内容は転記しない。
        raise ClientConfigurationError(
            "Cannot load user ADC from ~/.config/gcloud/application_default_credentials.json; "
            "create valid user ADC with Google Cloud CLI"
        ) from None
    project = credentials.quota_project_id
    if not isinstance(project, str) or not project.strip():
        raise ClientConfigurationError("ADC quota_project_id is required; configure the ADC quota project")
    http_options = types.HttpOptions(
        timeout=int(request.limits.api_timeout_seconds * 1000),
        retry_options=types.HttpRetryOptions(attempts=1),
    )
    return genai.Client(
        vertexai=True,
        project=project,
        location="global",
        credentials=credentials,
        http_options=http_options,
    )
