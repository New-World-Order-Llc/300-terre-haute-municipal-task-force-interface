"""Status tracking for pipeline records."""
STATES = ("received", "validated", "routed", "sent", "rejected", "closed")


class StatusTracker:
    def __init__(self, audit=None):
        self._status = {}
        self.audit = audit

    def set(self, ref_id, status):
        if status not in STATES:
            raise ValueError("unknown status: %s" % status)
        self._status[ref_id] = status
        if self.audit:
            self.audit.log("status_change", reference_id=ref_id, status=status)

    def get(self, ref_id):
        return self._status.get(ref_id)
