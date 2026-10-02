from core.audit import log_event
from core.webhook_dispatcher import dispatch_webhook


def send_cap_webhook(cap_packet: dict) -> bool:
    log_event("cap_webhook_attempt", cap_packet)
    return dispatch_webhook("cap", cap_packet)
