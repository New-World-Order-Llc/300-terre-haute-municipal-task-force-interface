'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { signingBytes, validatePacket, verifyPacketSignature } = require('../scripts/packet_utils');
const { readPacketFile } = require('../scripts/packet_utils');
const { sendPacket } = require('../scripts/send_packet_email');

const { privateKey, publicKey } = crypto.generateKeyPairSync('ed25519');
const publicKeyPem = publicKey.export({ type: 'spki', format: 'pem' });

function makePacket() {
  const packet = {
    packet_id: '550e8400-e29b-41d4-a716-446655440000',
    packet_type: 'TASKFORCE',
    timestamp: '2026-10-03T18:00:00Z',
    payload: { nested: { z: 1, a: true }, items: ['one', 'two'] },
    signature: '',
  };
  packet.signature = crypto.sign(null, signingBytes(packet), privateKey).toString('base64');
  return packet;
}

test('validates and verifies a signed packet', () => {
  const packet = makePacket();
  assert.equal(validatePacket(packet), packet);
  assert.equal(verifyPacketSignature(packet, publicKeyPem), true);
});

test('rejects malformed packet fields and invalid signatures', () => {
  const packet = makePacket();
  assert.throws(() => validatePacket({ ...packet, packet_type: 'UNKNOWN' }), /packet_type/);
  assert.throws(() => validatePacket({ ...packet, timestamp: '2026-10-03' }), /timestamp/);
  assert.throws(() => validatePacket({ ...packet, timestamp: '2026-02-31T18:00:00Z' }), /timestamp/);
  assert.throws(() => verifyPacketSignature({ ...packet, payload: { altered: true } }, publicKeyPem), /verification failed/);
  assert.throws(() => verifyPacketSignature(packet, publicKeyPem, 'dc56a418-ae97-4b53-94e1-a4316fed0ce6'), /verification failed/);
  assert.throws(() => verifyPacketSignature(packet, 'not a public key'), /SIGNING_PUBLIC_KEY is invalid/);
});

test('restricts workflow packet files to the configured outbox', () => {
  const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'munisible-packets-'));
  const packetsDirectory = path.join(temporaryDirectory, 'packets');
  fs.mkdirSync(packetsDirectory);
  const packetFile = path.join(packetsDirectory, 'packet.json');
  const outsideFile = path.join(temporaryDirectory, 'outside.json');
  fs.writeFileSync(packetFile, JSON.stringify(makePacket()));
  fs.writeFileSync(outsideFile, JSON.stringify(makePacket()));
  assert.equal(readPacketFile(packetFile, packetsDirectory).packet_type, 'TASKFORCE');
  assert.throws(() => readPacketFile(outsideFile, packetsDirectory), /inside the allowed packet directory/);
  assert.throws(() => readPacketFile(packetFile, path.join(temporaryDirectory, 'missing')), /ENOENT/);
  fs.rmSync(temporaryDirectory, { recursive: true, force: true });
});

test('sends only a signed packet over a TLS SMTP transport', async () => {
  const packet = makePacket();
  let transportOptions;
  let sentMessage;
  const env = {
    SMTP_HOST: 'smtp.example.invalid',
    SMTP_PORT: '587',
    SMTP_USER: 'sender',
    SMTP_PASS: 'secret',
    SYSTEM_EMAIL: 'sender@example.invalid',
    SIGNING_PUBLIC_KEY: publicKeyPem,
  };
  await sendPacket(packet, 'city@example.invalid', env, (options) => {
    transportOptions = options;
    return { sendMail: async (message) => { sentMessage = message; } };
  });
  assert.equal(transportOptions.requireTLS, true);
  assert.equal(sentMessage.to, 'city@example.invalid');
  assert.equal(sentMessage.subject, `${packet.packet_type}:${packet.packet_id}:${packet.timestamp}`);
});
