"""SMTP send / IMAP receive client. Credentials come from environment variables."""
import email
import imaplib
import os
import smtplib
import time
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
        self.connect_attempts = int(self.cfg.get("smtp_connect_attempts", 1))
        self.retry_backoff_seconds = float(self.cfg.get("smtp_retry_backoff_seconds", 0))
        if not 1 <= self.connect_attempts <= 5 or self.retry_backoff_seconds < 0:
            raise ValueError("SMTP retry settings are out of range")

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

    def send(self, sender, subject, body, reference_id=None):
        msg = self.build_message(sender, subject, body)
        user, password = self._credentials()
        for attempt in range(1, self.connect_attempts + 1):
            metadata = {
                "endpoint": self.endpoint,
                "host": self.cfg["smtp_host"],
                "port": self.cfg["smtp_port"],
                "tls": True,
                "attempt": attempt,
                "reference_id": reference_id,
            }
            self.audit.log("smtp_delivery_attempt", **metadata)
            try:
                smtp = smtplib.SMTP(self.cfg["smtp_host"], self.cfg["smtp_port"])
            except (OSError, smtplib.SMTPConnectError) as exc:
                self.audit.log(
                    "smtp_delivery_failed",
                    **metadata,
                    failure_type=type(exc).__name__,
                )
                if attempt == self.connect_attempts:
                    raise
                time.sleep(self.retry_backoff_seconds * attempt)
                continue

            try:
                with smtp:
                    smtp.starttls()
                    smtp.login(user, password)
                    refused = smtp.send_message(msg)
                response_codes = sorted(
                    response[0]
                    for response in refused.values()
                    if isinstance(response, tuple) and response
                    and isinstance(response[0], int)
                )
                if refused:
                    raise smtplib.SMTPRecipientsRefused(refused)
            except Exception as exc:
                recipients = getattr(exc, "recipients", {})
                response_codes = sorted(
                    response[0]
                    for response in recipients.values()
                    if isinstance(response, tuple) and response
                    and isinstance(response[0], int)
                )
                self.audit.log(
                    "smtp_delivery_failed",
                    **metadata,
                    failure_type=type(exc).__name__,
                    response_code=getattr(exc, "smtp_code", None),
                    response_codes=response_codes,
                )
                raise

            self.audit.log("email_sent", **metadata)
            return msg

    def health_check(self):
        """Check SMTP connectivity and STARTTLS without sending mail or authenticating."""
        metadata = {
            "endpoint": self.endpoint,
            "host": self.cfg["smtp_host"],
            "port": self.cfg["smtp_port"],
            "tls": True,
        }
        try:
            with smtplib.SMTP(self.cfg["smtp_host"], self.cfg["smtp_port"]) as smtp:
                smtp.starttls()
        except Exception as exc:
            self.audit.log(
                "smtp_health_check_failed",
                **metadata,
                failure_type=type(exc).__name__,
                response_code=getattr(exc, "smtp_code", None),
            )
            return False
        self.audit.log("smtp_health_check_succeeded", **metadata)
        return True

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
