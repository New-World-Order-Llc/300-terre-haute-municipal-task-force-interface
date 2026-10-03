# 300-terre-haute-municipal-task-force-interface

Deterministic municipal integration module for coordination between New World Order DAO/LLC, the City of Terre Haute Mayor's Office, and community action programs under the Munisible Task Force operations framework. Provides a one-code pipeline for intake, validation, routing, status tracking, audit logging and email.

> **Notice:** This repository is an *integration module only*. It does **not** represent, speak for, or impersonate the official Mayor's Office or any municipal authority. All outbound messages carry an integration-module label.

## Layout
- `config/` – `email_endpoints.yaml` (placeholders only), `compliance_policies.yaml`
- `core/` – `intake`, `routing`, `status`, `audit` (JSON-line, UTC, compliance-tagged)
- `communications/` – SMTP/IMAP `email_client.py` and message templates
- `adapters/` – DAO, LLC and municipal adapters
- `tests/` – run with `python -m unittest discover -s tests -t .`

## Configuration
The Mayor's Office recipient is the public address currently published by the [City of Terre Haute](https://www.terrehaute.in.gov/government/mayor/index.php). Municipal and community-action records route to the `mayor_office` endpoint. SMTP connection retries are bounded and logged; failures after an SMTP session is established are not retried because delivery may be ambiguous. `EmailClient.health_check()` verifies connectivity and STARTTLS without authenticating or sending a message.

Configure SMTP/IMAP hosts and ports in `config/email_endpoints.yaml` for an approved provider before use; checked-in host values are placeholders, so live delivery is not activated. Credentials for this endpoint are read from `MAYOR_OFFICE_EMAIL_USER` and `MAYOR_OFFICE_EMAIL_PASSWORD` and must not be committed. Audit log path: `AUDIT_LOG_PATH` (default `audit.log.jsonl`); it is a local JSONL log, not a DAO ledger or immutable chain anchor. The retention notice is not a retention schedule: confirm requirements with the responsible records authority before deployment.

This repository does not contain governance document #84, a configured webhook, an Ethereum anchoring client, a runtime secret manager, or an audited LUCR contract. No real-money transfer, benefits payment, or informant-program funding is implemented. Those integrations require independent legal, security, and governance review before activation.
