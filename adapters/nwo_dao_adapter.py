def dao_format(payload):
    return {
        "dao_ready": True,
        "dao_packet": {
            "case_id": payload.get("case_id"),
            "subject": payload.get("subject"),
            "description": payload.get("description"),
            "governance_flag": True,
        },
    }
