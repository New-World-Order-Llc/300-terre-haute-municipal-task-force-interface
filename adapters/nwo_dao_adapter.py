"""Adapter for New World Order DAO."""


def to_record(payload):
    """Normalize a New World Order DAO payload into an intake record."""
    return {
        "source": "nwo_dao",
        "category": "dao",
        "subject": payload.get("subject", ""),
        "body": payload.get("body", ""),
    }
