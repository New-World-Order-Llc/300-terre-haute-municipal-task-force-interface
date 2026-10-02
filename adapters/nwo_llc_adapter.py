"""Adapter for New World Order Health & Wellbeing LLC."""


def to_record(payload):
    """Normalize a New World Order Health & Wellbeing LLC payload into an intake record."""
    return {
        "source": "nwo_llc",
        "category": "llc",
        "subject": payload.get("subject", ""),
        "body": payload.get("body", ""),
    }
