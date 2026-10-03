# Municipal email endpoint

This is an integration protocol proposal, not an official City of Terre Haute specification or endorsement. Confirm the address, authorization, and security requirements with the City before use.

- Example recipient: `munisible@terrehaute.in.gov` (unverified; configure the actual authorized address in `CITY_ENDPOINT_EMAIL`).
- Subject: `PACKET_TYPE:PACKET_ID:TIMESTAMP`, for example `TASKFORCE:550e8400-e29b-41d4-a716-446655440000:2026-10-03T18:00:00Z`.
- Body: the JSON envelope defined in [email-packet-format.md](email-packet-format.md), serialized as readable JSON.
- Transport: authenticated SMTP with TLS. Credentials and the sender mailbox are provided through environment variables or GitHub Actions secrets; do not place credentials in this repository.
- Sender identity: use only an authorized service mailbox. Messages are integration-module traffic, not official City communications.

Before enabling the manual GitHub Actions workflow, configure its `municipal-email-send` environment with required reviewers and add the SMTP and endpoint secrets there. The workflow reads only `.json` packet files from `packets/`. Review each packet before approval. Do not send personal, informant, or restricted case information by email unless the City has expressly approved the data and channel.

## Signature binding

The `signature` is a detached Ed25519 signature, base64-encoded, over the UTF-8 bytes:

```text
MUNISIBLE_PACKET_V1
<wallet_anchor>
<canonical_packet_json>
```

`wallet_anchor` is the configured UUID `0cad6a0d-1462-47eb-853e-17521d57322e`. Canonical packet JSON is compact JSON with object keys sorted recursively, array order preserved, and the top-level `signature` property omitted. The packet fields and payload are otherwise included. The sender verifies the signature against the configured Ed25519 public key before connecting to SMTP. The anchor is a domain-separation identifier, not a private key or proof of City authorization; protect the private signing key and establish the public-key trust relationship separately.
