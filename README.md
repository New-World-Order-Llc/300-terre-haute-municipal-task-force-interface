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
The Mayor's Office recipient is the public address currently published by the [City of Terre Haute](https://www.terrehaute.in.gov/government/mayor/index.php). Configure the SMTP/IMAP hosts and ports in `config/email_endpoints.yaml` for an approved mail provider before use; the checked-in host values are placeholders. Provider credentials are read from `<ENDPOINT>_EMAIL_USER` and `<ENDPOINT>_EMAIL_PASSWORD` (e.g. `MAYORS_OFFICE_EMAIL_USER`) and must not be committed. Audit log path: `AUDIT_LOG_PATH` (default `audit.log.jsonl`).
