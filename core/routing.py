"""Deterministic routing of validated records."""
ROUTES = {
    "dao": "nwo_dao",
    "llc": "nwo_llc",
    "municipal": "municipal",
    "community_action": "municipal",
}


def route(record, audit=None, tracker=None, ref=None):
    destination = ROUTES[record["category"]]
    if audit:
        audit.log("routing", reference_id=ref, destination=destination)
    if tracker and ref:
        tracker.set(ref, "routed")
    return destination
