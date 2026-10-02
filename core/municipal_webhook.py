from core.audit import log_event
from core.webhook_dispatcher import dispatch_webhook


def send_municipal_webhook(packet: dict) -> bool:
    log_event("municipal_webhook_attempt", packet)
    return dispatch_webhook("municipal", packet)
