import os
import tempfile
import unittest

from core.audit import AuditLogger
from core.intake import intake, reference_id
from core.status import StatusTracker


class IntakeTest(unittest.TestCase):
    rec = {"source": "nwo_dao", "category": "dao", "subject": "s", "body": "b"}

    def test_valid_and_deterministic(self):
        with tempfile.TemporaryDirectory() as d:
            audit = AuditLogger(os.path.join(d, "a.jsonl"))
            tracker = StatusTracker(audit)
            ref, errors = intake(self.rec, audit, tracker)
            self.assertEqual(errors, [])
            self.assertEqual(ref, reference_id(self.rec))
            self.assertEqual(tracker.get(ref), "validated")
            self.assertIn("MUNISIBLE_TASK_FORCE", open(audit.path).read())

    def test_invalid(self):
        _, errors = intake({"category": "x"})
        self.assertTrue(errors)

    def test_impersonation_rejected(self):
        _, errors = intake(dict(self.rec, impersonates_authority=True))
        self.assertTrue(errors)


if __name__ == "__main__":
    unittest.main()
