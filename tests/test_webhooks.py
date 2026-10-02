import threading

import pytest

from api.webhooks import make_webhook_test_server
from core import audit, webhook_dispatcher
from core.webhook_dispatcher import dispatch_webhook


@pytest.fixture(autouse=True)
def isolate(tmp_path, monkeypatch):
    monkeypatch.setattr(audit, "AUDIT_LOG", tmp_path / "a.log")
    monkeypatch.setattr(webhook_dispatcher, "RETRY_DELAY", 0)


def cfg(tmp_path, monkeypatch, text):
    p = tmp_path / "webhooks.yaml"
    p.write_text(text)
    monkeypatch.setattr("core.webhook_dispatcher.CONFIG_PATH", p)


def test_missing_config(monkeypatch):
    monkeypatch.setattr("core.webhook_dispatcher.CONFIG_PATH", "nonexistent.yaml")
    assert dispatch_webhook("cap", {"x": 1}) is False


def test_missing_url(tmp_path, monkeypatch):
    cfg(tmp_path, monkeypatch, "cap: {}\n")
    assert dispatch_webhook("cap", {"x": 1}) is False


def test_placeholder_not_contacted(tmp_path, monkeypatch):
    cfg(tmp_path, monkeypatch, 'cap:\n  url: "CAP_WEBHOOK_URL_PLACEHOLDER"\n')
    monkeypatch.setattr("urllib.request.urlopen", lambda *a, **k: pytest.fail("contacted"))
    assert dispatch_webhook("cap", {}) is False


def test_non_http_scheme_rejected(tmp_path, monkeypatch):
    cfg(tmp_path, monkeypatch, 'cap:\n  url: "file:///etc/passwd"\n')
    assert dispatch_webhook("cap", {}) is False


def test_success_and_retry(tmp_path, monkeypatch):
    srv = make_webhook_test_server(0)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    port = srv.server_address[1]
    try:
        cfg(tmp_path, monkeypatch, f'cap:\n  url: "http://127.0.0.1:{port}/"\n')
        assert dispatch_webhook("cap", {"x": 1}) is True
    finally:
        srv.shutdown()
        srv.server_close()
    cfg(tmp_path, monkeypatch, f'cap:\n  url: "http://127.0.0.1:{port}/"\n  retries: 2\n  timeout: 1\n')
    assert dispatch_webhook("cap", {"x": 1}) is False
