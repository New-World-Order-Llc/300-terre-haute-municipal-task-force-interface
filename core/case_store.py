import json
from datetime import datetime, timezone
from pathlib import Path

CASE_STORE = Path("data/cases.jsonl")


def _now():
    return datetime.now(timezone.utc).isoformat()


def _append(record):
    CASE_STORE.parent.mkdir(parents=True, exist_ok=True)
    with open(CASE_STORE, "a") as f:
        f.write(json.dumps(record) + "\n")


def _records():
    if not CASE_STORE.exists():
        return
    with open(CASE_STORE, "r") as f:
        for line in f:
            try:
                record = json.loads(line)
            except json.JSONDecodeError:
                continue
            if isinstance(record, dict):
                yield record


def save_case(case_id, packet):
    """Append a new case record to the case store."""
    _append({"case_id": case_id, "timestamp": _now(), "packet": packet})


def update_case_status(case_id, status):
    """Append a status update entry for a case. Returns False if the case is unknown."""
    if get_case(case_id) is None:
        return False
    _append({"case_id": case_id, "timestamp": _now(), "status": status})
    return True


def get_case(case_id):
    """Return the case: latest packet record plus latest status and history."""
    case = None
    history = []
    for record in _records():
        if record.get("case_id") != case_id:
            continue
        if "packet" in record:
            case = dict(record)
        if "status" in record:
            history.append({"status": record["status"], "timestamp": record.get("timestamp")})
    if case is None:
        return None
    case["status"] = history[-1]["status"] if history else None
    case["history"] = history
    return case


def list_cases():
    """Return all case_ids in the store."""
    return sorted({r["case_id"] for r in _records() if r.get("case_id")})
