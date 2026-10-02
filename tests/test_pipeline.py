from unittest import mock

from communications import email_client
from core import audit, case_store, pipeline
from core.cap_routing import cap_route
from core.validation import validate_payload

GOOD = {"case_id": "c1", "subject": "s", "description": "d"}


def test_validation():
    assert validate_payload(GOOD)["valid"]
    assert validate_payload({"case_id": "x"})["missing_fields"] == ["subject", "description"]


def test_pipeline(tmp_path, monkeypatch):
    monkeypatch.setattr(audit, "AUDIT_LOG", tmp_path / "a.log")
    monkeypatch.setattr(case_store, "CASE_STORE", tmp_path / "cases.jsonl")
    out = pipeline.run_pipeline(GOOD)
    assert out["municipal"]["packet"]["case_id"] == "c1"
    assert out["status"]["case_id"] == "c1"
    assert out["cap"]["cap_packet"]["case_id"] == "c1"
    assert "routing" not in pipeline.run_pipeline({"case_id": "x"})


def test_cap():
    assert cap_route(GOOD)["cap_packet"]["action"] == "forward_to_CAP"


def test_retry(tmp_path, monkeypatch):
    monkeypatch.setattr(audit, "AUDIT_LOG", tmp_path / "a.log")
    with mock.patch.object(email_client, "send_mayors_office_email", side_effect=OSError("x")), \
            mock.patch.object(email_client.time, "sleep"):
        assert email_client.send_with_retry("s", "b") is False
    assert email_client.validate_config({}) 
