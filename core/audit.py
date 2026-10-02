"""Deterministic JSON-line audit logger (UTC timestamps, compliance tag)."""
import json
import os
from datetime import datetime, timezone

COMPLIANCE_TAG = "MUNISIBLE_TASK_FORCE"
DEFAULT_PATH = "audit.log.jsonl"


def utc_now():
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


class AuditLogger:
    def __init__(self, path=None, clock=utc_now):
        self.path = path or os.environ.get("AUDIT_LOG_PATH", DEFAULT_PATH)
        self.clock = clock

    def log(self, event, **fields):
        record = {"timestamp": self.clock(), "compliance": COMPLIANCE_TAG, "event": event}
        record.update(fields)
        line = json.dumps(record, sort_keys=True, separators=(",", ":"))
        with open(self.path, "a", encoding="utf-8") as fh:
            fh.write(line + "\n")
        return record
