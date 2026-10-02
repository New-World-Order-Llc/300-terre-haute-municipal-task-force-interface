def cap_route(payload):
    return {
        "cap_ready": True,
        "cap_packet": {
            "case_id": payload.get("case_id"),
            "action": "forward_to_CAP",
            "notes": "Community Action Program routing engaged",
        },
    }
