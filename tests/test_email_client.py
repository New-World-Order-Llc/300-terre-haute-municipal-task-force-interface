import os
import tempfile
import unittest
from unittest import mock

from communications.email_client import EmailClient
from core.audit import AuditLogger


class EmailClientTest(unittest.TestCase):
    def setUp(self):
        self.d = tempfile.TemporaryDirectory()
        self.audit = AuditLogger(os.path.join(self.d.name, "a.jsonl"))
        self.env = {"MAYORS_OFFICE_EMAIL_USER": "u", "MAYORS_OFFICE_EMAIL_PASSWORD": "p"}
        self.client = EmailClient("mayors_office", audit=self.audit, env=self.env)

    def tearDown(self):
        self.d.cleanup()

    def test_send_logs(self):
        with mock.patch("smtplib.SMTP") as smtp:
            smtp.return_value.__enter__.return_value.send_message.return_value = {}
            self.client.send("noreply@placeholder.invalid", "hi", "body")
            send_message = smtp.return_value.__enter__.return_value.send_message
            send_message.assert_called_once()
            self.assertEqual(send_message.call_args.args[0]["To"], "mayor@terrehaute.in.gov")
        with open(self.audit.path, encoding="utf-8") as audit_file:
            self.assertIn("email_sent", audit_file.read())

    def test_retries_only_connection_failures_and_audits_attempts(self):
        smtp = mock.MagicMock()
        smtp.__enter__.return_value = smtp
        smtp.send_message.return_value = {}
        with mock.patch(
            "communications.email_client.smtplib.SMTP",
            side_effect=[OSError("connection failed"), smtp],
        ) as smtp_factory, mock.patch("communications.email_client.time.sleep") as sleep:
            self.client.send("noreply@placeholder.invalid", "hi", "body", reference_id="ref")

        self.assertEqual(smtp_factory.call_count, 2)
        sleep.assert_called_once_with(0.5)
        with open(self.audit.path, encoding="utf-8") as audit_file:
            audit = audit_file.read()
        self.assertIn("smtp_delivery_failed", audit)
        self.assertIn("smtp_delivery_attempt", audit)
        self.assertIn("email_sent", audit)
        self.assertNotIn("connection failed", audit)

    def test_health_check_does_not_authenticate_or_send(self):
        with mock.patch("smtplib.SMTP") as smtp:
            self.assertTrue(self.client.health_check())
            session = smtp.return_value.__enter__.return_value
            session.starttls.assert_called_once()
            session.login.assert_not_called()
            session.send_message.assert_not_called()

    def test_missing_credentials(self):
        c = EmailClient("mayors_office", audit=self.audit, env={})
        with self.assertRaises(RuntimeError):
            c.send("a", "b", "c")


if __name__ == "__main__":
    unittest.main()
