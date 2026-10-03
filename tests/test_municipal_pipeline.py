import json
import os
import tempfile
import unittest
from unittest import mock

from adapters.municipal_adapter import format_outbound
from communications.email_client import EmailClient
from core.audit import AuditLogger
from core.intake import intake
from core.routing import route
from core.status import StatusTracker


class MunicipalPipelineTest(unittest.TestCase):
    def test_intake_routing_template_email_and_audit(self):
        with tempfile.TemporaryDirectory() as directory:
            audit = AuditLogger(os.path.join(directory, "audit.jsonl"))
            tracker = StatusTracker(audit)
            record = {
                "source": "community_action",
                "category": "community_action",
                "subject": "Community action update",
                "body": "Packet summary",
            }
            reference_id, errors = intake(record, audit=audit, tracker=tracker)
            self.assertEqual(errors, [])
            self.assertEqual(
                route(record, audit=audit, tracker=tracker, ref=reference_id),
                "mayor_office",
            )
            content = format_outbound(
                record["subject"],
                record["body"],
                "mayor@terrehaute.in.gov",
                reference_id,
                template="municipal_packet_receipt.txt",
            )
            self.assertIn("not confirmation of receipt by the City", content)
            self.assertIn(reference_id, content)

            email_env = {
                "MAYORS_OFFICE_EMAIL_USER": "test-user",
                "MAYORS_OFFICE_EMAIL_PASSWORD": "test-password",
            }
            client = EmailClient("mayors_office", audit=audit, env=email_env)
            with mock.patch("smtplib.SMTP") as smtp:
                smtp.return_value.__enter__.return_value.send_message.return_value = {}
                client.send(
                    "integration@example.invalid",
                    record["subject"],
                    content,
                    reference_id=reference_id,
                )
                message = smtp.return_value.__enter__.return_value.send_message.call_args.args[0]
                self.assertEqual(message["To"], "mayor@terrehaute.in.gov")
                self.assertIn("INTEGRATION MODULE", message.get_content())

            with open(audit.path, encoding="utf-8") as audit_file:
                events = [json.loads(line)["event"] for line in audit_file]
            self.assertIn("intake", events)
            self.assertIn("routing", events)
            self.assertIn("smtp_delivery_attempt", events)
            self.assertIn("email_sent", events)
            self.assertEqual(tracker.get(reference_id), "routed")

    def test_template_name_is_allowlisted(self):
        with self.assertRaises(ValueError):
            format_outbound("subject", "body", "recipient", "ref", template="../README.md")


if __name__ == "__main__":
    unittest.main()
