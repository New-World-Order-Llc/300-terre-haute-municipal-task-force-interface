"""SMTP send / IMAP receive client. Credentials come from environment variables."""
import email
import imaplib
import os
import smtplib
from email.message import EmailMessage

import yaml

from core.audit import AuditLogger

DEFAULT_CONFIG = os.path.join(os.path.dirname(__file__), "..", "config", "email_endpoints.yaml")


class EmailClient:
    def __init__(self, endpoint, config_path=DEFAULT_CONFIG, audit=None, env=None):
        with open(config_path, encoding="utf-8") as fh:
            self.cfg = yaml.safe_load(fh)[endpoint]
        self.endpoint = endpoint
        self.audit = audit or AuditLogger()
        self.env = os.environ if env is None else env

    def _credentials(self):
        prefix = self.endpoint.upper()
        user = self.env.get(prefix + "_EMAIL_USER")
        password = self.env.get(prefix + "_EMAIL_PASSWORD")
        if not user or not password:
            raise RuntimeError("missing credentials in environment for %s" % prefix)
        return user, password

    def build_message(self, sender, subject, body):
        msg = EmailMessage()
        msg["From"] = sender
        msg["To"] = self.cfg["email"]
        msg["Subject"] = subject
        msg.set_content(body)
        return msg

    def send(self, sender, subject, body):
        msg = self.build_message(sender, subject, body)
        user, password = self._credentials()
        with smtplib.SMTP(self.cfg["smtp_host"], self.cfg["smtp_port"]) as smtp:
            smtp.starttls()
            smtp.login(user, password)
            smtp.send_message(msg)
        self.audit.log("email_sent", endpoint=self.endpoint, subject=subject)
        return msg

    def receive(self, mailbox="INBOX", criteria="UNSEEN"):
        user, password = self._credentials()
        messages = []
        imap = imaplib.IMAP4_SSL(self.cfg["imap_host"], self.cfg["imap_port"])
        try:
            imap.login(user, password)
            imap.select(mailbox)
            _, data = imap.search(None, criteria)
            for num in data[0].split():
                _, parts = imap.fetch(num, "(RFC822)")
                messages.append(email.message_from_bytes(parts[0][1]))
        finally:
            try:
                imap.logout()
            except Exception:
                pass
        self.audit.log("email_received", endpoint=self.endpoint, count=len(messages))
        return messages
