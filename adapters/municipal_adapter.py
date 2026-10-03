"""Municipal integration adapter (integration only; never impersonates the Mayor's Office)."""
import os

from core.intake import load_policies

TEMPLATES = os.path.join(os.path.dirname(__file__), "..", "communications", "templates")
ALLOWED_TEMPLATES = {
    "mayor_office_notification.txt",
    "community_action_update.txt",
    "municipal_packet_receipt.txt",
}


def format_outbound(subject, body, recipient, reference_id, template="mayor_office_notification.txt"):
    policies = load_policies()
    if template not in ALLOWED_TEMPLATES:
        raise ValueError("unknown municipal template: %s" % template)
    with open(os.path.join(TEMPLATES, template), encoding="utf-8") as fh:
        tpl = fh.read()
    return tpl.format(integration_label=policies["integration_label"], recipient=recipient,
                      subject=subject, body=body, reference_id=reference_id, status="open",
                      classification=policies["municipal_correspondence_classification"],
                      retention_notice=policies["retention_notice"])


def parse_inbound(message):
    """Parse an email.message.Message into an intake-style record."""
    if message.is_multipart():
        part = message.get_payload(0)
        body = part.get_payload(decode=True).decode("utf-8", "replace")
    else:
        body = message.get_payload(decode=True).decode("utf-8", "replace")
    subject = message.get("Subject", "")
    return {
        "source": "municipal",
        "category": "community_action" if "community action" in subject.lower() else "municipal",
        "subject": subject,
        "body": body.strip(),
    }


def community_action_hook(record, handler):
    """Routing hook: invoke handler for Community Action Program records."""
    if record.get("category") == "community_action":
        return handler(record)
    return None
