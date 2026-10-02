def municipal_format(payload):
    return {
        "municipal_ready": True,
        "packet": {
            "case_id": payload.get("case_id"),
            "subject": payload.get("subject"),
            "details": payload.get("description"),
            "origin": "New World Order DAO / LLC Interface",
            "compliance": "Munisible Task Force Operations v1.0",
        },
    }
