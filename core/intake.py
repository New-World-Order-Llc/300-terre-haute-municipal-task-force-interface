"""Intake and validation."""
import hashlib
import json
import os

import yaml

POLICY_PATH = os.path.join(os.path.dirname(__file__), "..", "config", "compliance_policies.yaml")
REQUIRED = ("source", "category", "subject", "body")


def load_policies(path=POLICY_PATH):
    with open(path, encoding="utf-8") as fh:
        return yaml.safe_load(fh)


def validate(record, policies=None):
    """Return a list of error strings (empty when valid)."""
    policies = policies or load_policies()
    errors = ["missing field: %s" % f for f in REQUIRED if not record.get(f)]
    if record.get("category") and record["category"] not in policies["valid_categories"]:
        errors.append("invalid category: %s" % record["category"])
    if record.get("impersonates_authority"):
        errors.append("impersonation of municipal authority is not permitted")
    return errors


def reference_id(record):
    """Deterministic reference id derived from the record content."""
    payload = json.dumps(
        {k: record.get(k) for k in REQUIRED}, sort_keys=True, separators=(",", ":")
    )
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()[:16]


def intake(record, audit=None, tracker=None, policies=None):
    """Validate a record; returns (reference_id, errors)."""
    ref = reference_id(record)
    if audit:
        audit.log("intake", reference_id=ref, source=record.get("source"))
    if tracker:
        tracker.set(ref, "received")
    errors = validate(record, policies)
    if tracker:
        tracker.set(ref, "rejected" if errors else "validated")
    if audit and errors:
        audit.log("validation_failed", reference_id=ref, errors=errors)
    return ref, errors
