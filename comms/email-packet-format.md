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
- `packet_type` is exactly one of `TASKFORCE`, `CAP_ROUTING`, `CASE_STORE`, `INFORMANT`, `TREASURY_FUND`, `BUDGET_APPROVED`, `BUDGET_REVOKED`, `FUNDS_RELEASED`, `TASKFORCE_NEW`, `TASKFORCE_STATUS`, `PROJECT_NEW`, `PROJECT_STATUS`, or `PROJECT_FUNDED`.
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

## On-chain event bridge

The optional `npm run packet-bridge` process polls the configured Treasury and MunisibleTaskForce contracts, processes events after `BRIDGE_START_BLOCK` once their configured confirmation depth is reached, signs packets locally, and writes them to `packets/`. The `.bridge-cursor.json` checkpoint resumes processing after restart; keep it with the bridge deployment and do not edit it while the bridge is running. Packets have deterministic IDs derived from chain ID, block hash, transaction hash, and log index, so replaying an already persisted log does not create a second file.

Configure `RPC_URL`, deployed `TREASURY_ADDRESS` and `TASKFORCE_ADDRESS`, `BRIDGE_START_BLOCK`, `SIGNING_PRIVATE_KEY`, and its matching `SIGNING_PUBLIC_KEY` in a secure bridge-host environment. `BRIDGE_CONFIRMATIONS` defaults to 2 and `BRIDGE_BLOCK_RANGE` to 500. The continuously running bridge needs signing capability; keep its private key in a dedicated, access-restricted host or signing service, never in the repository or GitHub Actions. The bridge verifies each signature before persistence. It does not email or dispatch workflows; review each packet and use the existing protected manual email workflow. Amounts are raw LUCR token base units because token decimals are not assumed.

Each payload includes network chain ID, block number/hash, transaction hash, and log index. For contract balance and project/budget state, the bridge reads state at the event's block tag (end-of-block state); multiple related transactions in one block may therefore make those contextual values later than the individual log. Task-force creation/status actors come from the originating transaction sender. Events do not reveal manager identity separately.
