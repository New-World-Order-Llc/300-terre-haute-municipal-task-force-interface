REQUIRED_FIELDS = ["case_id", "subject", "description"]


def validate_payload(payload):
    if not isinstance(payload, dict):
        return {"valid": False, "missing_fields": list(REQUIRED_FIELDS)}

    missing = [f for f in REQUIRED_FIELDS if f not in payload]
    if missing:
        return {"valid": False, "missing_fields": missing}

    return {"valid": True, "payload": payload}
