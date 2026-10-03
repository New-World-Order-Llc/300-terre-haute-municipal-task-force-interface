# Email packet format

Each message body is a UTF-8 JSON object:

```json
{
  "packet_id": "550e8400-e29b-41d4-a716-446655440000",
  "packet_type": "TASKFORCE",
  "timestamp": "2026-10-03T18:00:00Z",
  "signature": "BASE64_ED25519_SIGNATURE",
  "payload": {}
}
```

Requirements:

- `packet_id` is a UUID.
- `packet_type` is exactly one of `TASKFORCE`, `CAP_ROUTING`, `CASE_STORE`, or `INFORMANT`.
- `timestamp` is an ISO 8601 date-time including a timezone.
- `signature` is a base64 Ed25519 signature as specified in [endpoint-spec.md](endpoint-spec.md).
- `payload` is a JSON object containing only information approved for this recipient and email channel.
- No additional top-level properties are allowed.

The subject is constructed from the validated values as `packet_type:packet_id:timestamp`. The sender refuses malformed packets and packets whose signature cannot be verified. Listing a packet type does not authorize disclosure: do not email personal, informant, or restricted case data without explicit approval for the recipient and channel.

Create a packet from an unsigned JSON envelope containing `packet_id`, `packet_type`, `timestamp`, and `payload` using `SIGNING_PRIVATE_KEY` held securely on a trusted local machine:

```sh
node scripts/create_packet.js unsigned-packet.json > signed-packet.json
```

The generator emits exactly the five required properties and an Ed25519 signature. Keep the private key offline and out of GitHub Actions; verify generated packets using the separately configured public key before placing them in `packets/`.
