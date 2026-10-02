def llc_format(payload):
    return {
        "llc_ready": True,
        "llc_packet": {
            "case_id": payload.get("case_id"),
            "subject": payload.get("subject"),
            "description": payload.get("description"),
            "compliance_flag": True,
        },
    }
