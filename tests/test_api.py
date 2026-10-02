import json
import threading
import urllib.error
import urllib.request

import pytest

from api.server import make_server
from core import audit, case_store


@pytest.fixture
def base(tmp_path, monkeypatch):
    monkeypatch.setattr(audit, "AUDIT_LOG", tmp_path / "a.log")
    monkeypatch.setattr(case_store, "CASE_STORE", tmp_path / "cases.jsonl")
    srv = make_server(port=0)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    yield f"http://127.0.0.1:{srv.server_address[1]}"
    srv.shutdown()
    srv.server_close()


def post(url, body):
    req = urllib.request.Request(url, json.dumps(body).encode(), {"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req) as r:
            return r.status, json.load(r)
    except urllib.error.HTTPError as e:
        return e.code, json.load(e)


def test_cases_and_status(base):
    code, body = post(base + "/cases", {"case_id": "c1", "subject": "s", "description": "d"})
    assert code == 201 and body["cap"]["cap_packet"]["case_id"] == "c1"
    with urllib.request.urlopen(base + "/status/c1") as r:
        body = json.load(r)
    assert body["case_id"] == "c1" and body["status"] == "cap_routed"
    with pytest.raises(urllib.error.HTTPError) as e:
        urllib.request.urlopen(base + "/status/nope")
    assert e.value.code == 404


def test_invalid(base):
    code, body = post(base + "/cases", {"case_id": "c1"})
    assert code == 422 and body["validation"]["valid"] is False
