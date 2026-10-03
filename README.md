# 300-terre-haute-municipal-task-force-interface

Deterministic municipal integration module for coordination between New World Order DAO/LLC, the City of Terre Haute Mayor's Office, and community action programs under the Munisible Task Force operations framework. Provides a one-code pipeline for intake, validation, routing, status tracking, audit logging and email.

> **Notice:** This repository is an *integration module only*. It does **not** represent, speak for, or impersonate the official Mayor's Office or any municipal authority. All outbound messages carry an integration-module label.

## Layout
- `config/` – `email_endpoints.yaml` (placeholders only), `compliance_policies.yaml`
- `core/` – `intake`, `routing`, `status`, `audit` (JSON-line, UTC, compliance-tagged)
- `communications/` – SMTP/IMAP `email_client.py` and message templates
- `comms/` – municipal packet and signature protocol
- `contracts/` – LUCR Treasury and task-force/project contracts
- `infra/` – example SMTP configuration
- `scripts/` – on-chain event bridge, signed packet verification, and email delivery
- `adapters/` – DAO, LLC and municipal adapters
- `tests/` – run with `python -m unittest discover -s tests -t .`

## Configuration
Endpoints come from `config/email_endpoints.yaml`; replace placeholders locally. Credentials are read from environment variables `<ENDPOINT>_EMAIL_USER` and `<ENDPOINT>_EMAIL_PASSWORD` (e.g. `MAYORS_OFFICE_EMAIL_USER`). Never commit real contact information. Audit log path: `AUDIT_LOG_PATH` (default `audit.log.jsonl`).

## Municipal packet email
See `comms/endpoint-spec.md` and `comms/email-packet-format.md` for the packet protocol. The example endpoint is not verified; confirm an authorized address with the City before sending. This integration does not represent the City or the Mayor's Office.

The Node.js sender accepts a signed packet JSON file and verifies its Ed25519 signature before sending. Generate packets locally with `node scripts/create_packet.js unsigned-packet.json > signed-packet.json`; this uses a local `SIGNING_PRIVATE_KEY` and never requires sending the private key to GitHub. Install dependencies with `npm ci`; run its tests with `npm test`. For local use, copy `env.example` to `.env` and load its values securely in your shell. Never commit credentials, private signing keys, or real packet data. Configure only the corresponding public key as the `SIGNING_PUBLIC_KEY` secret.

The manual GitHub Actions workflow sends only packets in `packets/` and uses the `municipal-email-send` environment. Configure that GitHub environment with required reviewers before adding SMTP secrets. Do not email personal, informant, or restricted case data unless the City has explicitly approved the data, channel, and handling requirements. `contracts/Treasury.sol` implements an admin-controlled LUCR vault with budget approval/revocation and fund-release events. `contracts/MunisibleTaskForce.sol` implements admin/manager-controlled task forces and projects, LUCR budgets and disbursement, and events for off-chain audit consumers. These contracts do not themselves generate, sign, or send municipal email packets; deployment, token/admin configuration, and an off-chain event consumer remain separate.

`npm run packet-bridge` runs the optional confirmed-block poller described in `comms/email-packet-format.md`. It signs and persists event packets locally using a protected signing key and resumable cursor; it never sends email or triggers the workflow automatically. Configure deployment addresses and RPC details only after independently verifying the chain and contract deployments.
