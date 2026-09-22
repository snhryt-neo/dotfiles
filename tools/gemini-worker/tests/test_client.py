from __future__ import annotations

import json
from unittest.mock import Mock

import pytest

from gemini_worker.client import ClientConfigurationError, build_client
from gemini_worker.schemas import WorkerRequest


@pytest.fixture
def client_setup(tmp_path, monkeypatch):
    monkeypatch.setattr("gemini_worker.client.Path.home", lambda: tmp_path)
    for name in ("GOOGLE_API_KEY", "GEMINI_API_KEY"):
        monkeypatch.delenv(name, raising=False)
    adc = tmp_path / ".config/gcloud/application_default_credentials.json"
    adc.parent.mkdir(parents=True)
    data = {
        "type": "authorized_user",
        "client_id": "test-client",
        "client_secret": "test-secret",
        "refresh_token": "test-refresh-token",
        "quota_project_id": "test-quota-project",
    }
    adc.write_text(json.dumps(data), encoding="utf-8")
    factory = Mock()
    monkeypatch.setattr("gemini_worker.client.genai.Client", factory)
    request = WorkerRequest(task_id="client-test", workspace=str(tmp_path), instructions="test")
    return request, adc, data, factory


@pytest.mark.parametrize("override_environment", [False, True])
def test_client_uses_fixed_adc_and_quota_project(client_setup, monkeypatch, override_environment):
    request, _, _, factory = client_setup
    values = {
        "GOOGLE_CLOUD_PROJECT": "other-project",
        "GOOGLE_CLOUD_LOCATION": "other-location",
        "GOOGLE_GENAI_USE_VERTEXAI": "false",
        "GOOGLE_APPLICATION_CREDENTIALS": "/nonexistent/other-credentials.json",
    }
    for name, value in values.items():
        if override_environment:
            monkeypatch.setenv(name, value)
        else:
            monkeypatch.delenv(name, raising=False)
    assert build_client(request) is factory.return_value
    options = factory.call_args.kwargs
    assert options["project"] == "test-quota-project"
    assert options["location"] == "global"
    assert options["vertexai"] is True
    assert options["credentials"].quota_project_id == "test-quota-project"
    assert options["credentials"].refresh_token == "test-refresh-token"


@pytest.mark.parametrize("quota_project", [None, "", "   ", 123])
def test_missing_or_invalid_quota_project_is_rejected(client_setup, quota_project):
    request, adc, data, factory = client_setup
    data["quota_project_id"] = quota_project
    adc.write_text(json.dumps(data), encoding="utf-8")
    with pytest.raises(ClientConfigurationError, match="quota_project_id"):
        build_client(request)
    factory.assert_not_called()


@pytest.mark.parametrize("failure", ["missing", "invalid_json", "invalid_credentials"])
def test_invalid_adc_does_not_expose_credentials(client_setup, failure):
    request, adc, _, factory = client_setup
    if failure == "missing":
        adc.unlink()
    elif failure == "invalid_json":
        adc.write_text("test-secret", encoding="utf-8")
    else:
        adc.write_text(json.dumps({"test-secret": "test-refresh-token"}), encoding="utf-8")
    with pytest.raises(ClientConfigurationError) as error:
        build_client(request)
    assert "test-secret" not in str(error.value)
    assert "test-refresh-token" not in str(error.value)
    factory.assert_not_called()


@pytest.mark.parametrize("name", ["GOOGLE_API_KEY", "GEMINI_API_KEY"])
def test_api_key_is_rejected(client_setup, monkeypatch, name):
    request, _, _, factory = client_setup
    monkeypatch.setenv(name, "test-api-key")
    with pytest.raises(ClientConfigurationError, match="API key authentication is not supported"):
        build_client(request)
    factory.assert_not_called()
