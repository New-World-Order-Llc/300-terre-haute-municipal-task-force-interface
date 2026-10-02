import json
from datetime import datetime, timezone
from pathlib import Path

AUDIT_LOG = Path("logs/munisible_audit.log")


def log_event(event_type, payload):
    record = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "event_type": event_type,
        "payload": payload,
        "framework": "Munisible Task Force Operations v1.0",
    }
    AUDIT_LOG.parent.mkdir(parents=True, exist_ok=True)
    with open(AUDIT_LOG, "a") as f:
        f.write(json.dumps(record) + "\n")
