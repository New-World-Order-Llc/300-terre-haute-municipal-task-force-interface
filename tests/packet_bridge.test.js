'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { verifyPacketSignature } = require('../scripts/packet_utils');
const {
  EVENT_PACKET_TYPES,
  buildEventPacket,
  deterministicPacketId,
} = require('../scripts/packet_bridge_utils');
const {
  assertCanonicalHash,
  loadConfig,
  loadCursor,
  persistPacket,
  saveCursor,
} = require('../scripts/packet_bridge');

const { privateKey, publicKey } = crypto.generateKeyPairSync('ed25519');
const privateKeyPem = privateKey.export({ type: 'pkcs8', format: 'pem' });
const publicKeyPem = publicKey.export({ type: 'spki', format: 'pem' });
const actor = '0x0000000000000000000000000000000000000001';
const context = {
  chainId: 11155111n,
  blockNumber: 100,
  blockHash: `0x${'1'.repeat(64)}`,
  transactionHash: `0x${'2'.repeat(64)}`,
  logIndex: 3,
};
const readers = {
  treasuryBalance: async () => 5000n,
  moduleBalance: async () => 1000n,
  moduleBudget: async () => 2500n,
  project: async () => ({ description: 'Project details', spentLucr: 200n, budgetLucr: 900n }),
};

const eventCases = [
  ['TreasuryFunded', { from: actor, amount: 100n }, 'TREASURY_FUND', ['from', 'amount', 'treasury_balance']],
  ['BudgetApproved', { module: actor, amount: 100n }, 'BUDGET_APPROVED', ['module', 'amount', 'new_module_budget']],
  ['BudgetRevoked', { module: actor, amount: 100n }, 'BUDGET_REVOKED', ['module', 'amount', 'new_module_budget']],
  ['FundsReleased', { module: actor, amount: 100n }, 'FUNDS_RELEASED', ['module', 'amount', 'treasury_balance', 'module_balance']],
  ['TaskForceCreated', { id: 1n, name: 'TF', jurisdiction: 'Terre Haute' }, 'TASKFORCE_NEW', ['task_force_id', 'name', 'jurisdiction', 'created_by']],
  ['TaskForceStatusChanged', { id: 1n, active: false }, 'TASKFORCE_STATUS', ['task_force_id', 'active', 'changed_by']],
  ['ProjectCreated', { id: 2n, taskForceId: 1n, name: 'Project', budgetLucr: 900n }, 'PROJECT_NEW', ['project_id', 'task_force_id', 'name', 'description', 'budget_lucr', 'created_by']],
  ['ProjectStatusChanged', { id: 2n, active: true }, 'PROJECT_STATUS', ['project_id', 'active', 'changed_by']],
  ['ProjectFunded', { projectId: 2n, recipient: actor, amountLucr: 100n }, 'PROJECT_FUNDED', ['project_id', 'recipient', 'amount_lucr', 'spent_lucr', 'budget_lucr']],
];

test('maps every supported chain event into a signed packet envelope', async () => {
  assert.equal(Object.keys(EVENT_PACKET_TYPES).length, eventCases.length);
  for (const [eventName, args, expectedType, expectedPayloadFields] of eventCases) {
    const packet = await buildEventPacket({
      eventName,
      args,
      actor,
      context,
      readers,
      privateKey: privateKeyPem,
      timestamp: '2026-10-03T19:00:00.000Z',
    });
    assert.equal(packet.packet_type, expectedType);
    assert.deepEqual(Object.keys(packet).sort(), ['packet_id', 'packet_type', 'timestamp', 'signature', 'payload'].sort());
    for (const field of expectedPayloadFields) {
      assert.ok(Object.hasOwn(packet.payload, field), `${eventName} should include ${field}`);
    }
    assert.equal(packet.payload.tx_hash, context.transactionHash);
    assert.equal(verifyPacketSignature(packet, publicKeyPem), true);
  }
});

test('uses stable unique packet IDs for canonical chain log identity', () => {
  const id = deterministicPacketId(context);
  assert.match(id, /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.equal(deterministicPacketId(context), id);
  assert.notEqual(deterministicPacketId({ ...context, logIndex: 4 }), id);
});

test('persists packets idempotently and binds restart cursors to deployment identity', () => {
  const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'munisible-bridge-'));
  const cursorPath = path.join(temporaryDirectory, 'cursor.json');
  const packetsPath = path.join(temporaryDirectory, 'packets');
  const identity = {
    chainId: '11155111',
    treasuryAddress: actor,
    taskForceAddress: '0x0000000000000000000000000000000000000002',
    startBlock: 20,
  };
  const config = { ...identity, cursorFile: cursorPath };
  const initialCursor = loadCursor(config, 11155111n);
  assert.equal(initialCursor.lastBlock, 19);
  initialCursor.lastBlock = 22;
  initialCursor.lastBlockHash = `0x${'a'.repeat(64)}`;
  saveCursor(cursorPath, initialCursor);
  assert.equal(loadCursor(config, 11155111n).lastBlock, 22);
  assert.throws(() => loadCursor(config, 1n), /does not match/);
  assert.throws(() => assertCanonicalHash(initialCursor.lastBlockHash, `0x${'b'.repeat(64)}`, 22), /reorganization detected/);
  assert.doesNotThrow(() => assertCanonicalHash(initialCursor.lastBlockHash, initialCursor.lastBlockHash, 22));

  const packet = {
    packet_id: '550e8400-e29b-51d4-a716-446655440000',
    packet_type: 'TASKFORCE_NEW',
    timestamp: '2026-10-03T19:00:00.000Z',
    signature: 'AA==',
    payload: {},
  };
  const writtenPath = persistPacket(packetsPath, packet);
  assert.equal(persistPacket(packetsPath, packet), writtenPath);
  assert.deepEqual(JSON.parse(fs.readFileSync(writtenPath, 'utf8')), packet);
  assert.throws(() => persistPacket(packetsPath, { ...packet, payload: { changed: true } }), /collision/);
  fs.rmSync(temporaryDirectory, { recursive: true, force: true });
});

test('requires an explicit deployment start block and valid contract addresses', () => {
  const env = {
    RPC_URL: 'https://rpc.example.invalid',
    BRIDGE_CHAIN_ID: '11155111',
    TREASURY_ADDRESS: actor,
    TASKFORCE_ADDRESS: '0x0000000000000000000000000000000000000002',
    SIGNING_PRIVATE_KEY: privateKeyPem,
    SIGNING_PUBLIC_KEY: publicKeyPem,
  };
  assert.throws(() => loadConfig(env), /BRIDGE_START_BLOCK/);
  assert.equal(loadConfig({ ...env, BRIDGE_START_BLOCK: '20' }).startBlock, 20);
  assert.throws(() => loadConfig({ ...env, RPC_URL: 'http://rpc.example.invalid', BRIDGE_START_BLOCK: '20' }), /HTTPS/);
  assert.throws(() => loadConfig({ ...env, BRIDGE_CHAIN_ID: undefined, BRIDGE_START_BLOCK: '20' }), /BRIDGE_CHAIN_ID/);
});
