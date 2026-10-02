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
            self.client.send("noreply@placeholder.invalid", "hi", "body")
            smtp.return_value.__enter__.return_value.send_message.assert_called_once()
        self.assertIn("email_sent", open(self.audit.path).read())

    def test_missing_credentials(self):
        c = EmailClient("mayors_office", audit=self.audit, env={})
        with self.assertRaises(RuntimeError):
            c.send("a", "b", "c")


if __name__ == "__main__":
    unittest.main()
