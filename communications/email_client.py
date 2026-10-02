import email
import imaplib
import smtplib
from email.mime.text import MIMEText
from pathlib import Path

import yaml

CONFIG_PATH = Path(__file__).resolve().parent.parent / "config" / "email_endpoints.yaml"


def load_config():
    with open(CONFIG_PATH, "r") as f:
        return yaml.safe_load(f)


def send_mayors_office_email(subject, body):
    cfg = load_config()["mayors_office"]
    msg = MIMEText(body)
    msg["Subject"] = subject
    msg["From"] = "nwo-system@example.com"
    msg["To"] = cfg["email"]

    with smtplib.SMTP(cfg["smtp_host"], cfg["smtp_port"]) as server:
        server.starttls()
        server.send_message(msg)


def fetch_mayors_office_inbox(limit=10):
    cfg = load_config()["mayors_office"]
    with imaplib.IMAP4_SSL(cfg["imap_host"], cfg["imap_port"]) as imap:
        imap.select("INBOX")
        typ, data = imap.search(None, "ALL")
        ids = data[0].split()[-limit:]
        messages = []
        for msg_id in ids:
            typ, msg_data = imap.fetch(msg_id, "(RFC822)")
            messages.append(email.message_from_bytes(msg_data[0][1]))
        return messages
