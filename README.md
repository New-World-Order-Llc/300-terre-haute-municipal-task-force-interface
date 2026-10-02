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
Endpoints come from `config/email_endpoints.yaml`; replace placeholders locally. Credentials are read from environment variables `<ENDPOINT>_EMAIL_USER` and `<ENDPOINT>_EMAIL_PASSWORD` (e.g. `MAYORS_OFFICE_EMAIL_USER`). Never commit real contact information. Audit log path: `AUDIT_LOG_PATH` (default `audit.log.jsonl`).
