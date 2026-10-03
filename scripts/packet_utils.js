'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const PACKET_TYPES = new Set([
  'TASKFORCE', 'CAP_ROUTING', 'CASE_STORE', 'INFORMANT',
  'TREASURY_FUND', 'BUDGET_APPROVED', 'BUDGET_REVOKED', 'FUNDS_RELEASED',
  'TASKFORCE_NEW', 'TASKFORCE_STATUS', 'PROJECT_NEW', 'PROJECT_STATUS', 'PROJECT_FUNDED',
]);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ISO_TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;
const DEFAULT_ANCHOR = '0cad6a0d-1462-47eb-853e-17521d57322e';

function canonicalize(value) {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalize).join(',')}]`;
  }
  if (value !== null && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalize(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function isValidTimestamp(timestamp) {
  if (typeof timestamp !== 'string' || !ISO_TIMESTAMP_PATTERN.test(timestamp)
      || !Number.isFinite(Date.parse(timestamp))) {
    return false;
  }
  const [, year, month, day, hour, minute, second, , offsetHour, offsetMinute] =
    timestamp.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:Z|([+-])(\d{2}):(\d{2}))$/);
  const numericMonth = Number(month);
  const numericDay = Number(day);
  const daysInMonth = [31, (Number(year) % 4 === 0 && (Number(year) % 100 !== 0 || Number(year) % 400 === 0)) ? 29 : 28,
    31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return numericMonth >= 1 && numericMonth <= 12
    && numericDay >= 1 && numericDay <= daysInMonth[numericMonth - 1]
    && Number(hour) <= 23 && Number(minute) <= 59 && Number(second) <= 59
    && (offsetHour === undefined || (Number(offsetHour) <= 23 && Number(offsetMinute) <= 59));
}

function validatePacket(packet) {
  if (packet === null || typeof packet !== 'object' || Array.isArray(packet)) {
    throw new Error('packet must be a JSON object');
  }
  const expectedKeys = ['packet_id', 'packet_type', 'timestamp', 'signature', 'payload'];
  if (Object.keys(packet).length !== expectedKeys.length
      || expectedKeys.some((key) => !Object.hasOwn(packet, key))) {
    throw new Error('packet must contain exactly packet_id, packet_type, timestamp, signature, and payload');
  }
  if (typeof packet.packet_id !== 'string' || !UUID_PATTERN.test(packet.packet_id)) {
    throw new Error('packet_id must be a UUID');
  }
  if (typeof packet.packet_type !== 'string' || !PACKET_TYPES.has(packet.packet_type)) {
    throw new Error('packet_type is not supported');
  }
  if (!isValidTimestamp(packet.timestamp)) {
    throw new Error('timestamp must be an ISO 8601 date-time with a timezone');
  }
  if (typeof packet.signature !== 'string' || packet.signature.length === 0
      || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(packet.signature)) {
    throw new Error('signature must be a base64 string');
  }
  if (packet.payload === null || typeof packet.payload !== 'object' || Array.isArray(packet.payload)) {
    throw new Error('payload must be a JSON object');
  }
  return packet;
}

function createSignedPacket(packet, privateKeyPem, anchor = DEFAULT_ANCHOR) {
  if (packet === null || typeof packet !== 'object' || Array.isArray(packet)) {
    throw new Error('packet must be a JSON object');
  }
  const { signature, ...unsignedPacket } = packet;
  if (signature !== undefined) {
    throw new Error('unsigned packet must not include signature');
  }
  const completePacket = { ...unsignedPacket, signature: Buffer.alloc(64).toString('base64') };
  validatePacket(completePacket);
  if (typeof privateKeyPem !== 'string' || privateKeyPem.trim() === '') {
    throw new Error('SIGNING_PRIVATE_KEY is required');
  }
  let privateKey;
  try {
    privateKey = crypto.createPrivateKey(privateKeyPem);
  } catch {
    throw new Error('SIGNING_PRIVATE_KEY is invalid');
  }
  if (privateKey.asymmetricKeyType !== 'ed25519') {
    throw new Error('SIGNING_PRIVATE_KEY must be an Ed25519 private key');
  }
  completePacket.signature = crypto.sign(null, signingBytes(completePacket, anchor), privateKey).toString('base64');
  return completePacket;
}

function signingBytes(packet, anchor = DEFAULT_ANCHOR) {
  if (typeof anchor !== 'string' || !UUID_PATTERN.test(anchor)) {
    throw new Error('wallet anchor must be a UUID');
  }
  const unsignedPacket = { ...packet };
  delete unsignedPacket.signature;
  return Buffer.from(`MUNISIBLE_PACKET_V1\n${anchor}\n${canonicalize(unsignedPacket)}`, 'utf8');
}

function verifyPacketSignature(packet, publicKeyPem, anchor = DEFAULT_ANCHOR) {
  validatePacket(packet);
  if (typeof publicKeyPem !== 'string' || publicKeyPem.trim() === '') {
    throw new Error('SIGNING_PUBLIC_KEY is required');
  }
  let publicKey;
  try {
    publicKey = crypto.createPublicKey(publicKeyPem);
  } catch {
    throw new Error('SIGNING_PUBLIC_KEY is invalid');
  }
  if (publicKey.asymmetricKeyType !== 'ed25519') {
    throw new Error('SIGNING_PUBLIC_KEY must be an Ed25519 public key');
  }
  const signature = Buffer.from(packet.signature, 'base64');
  if (signature.length !== 64 || signature.toString('base64') !== packet.signature
      || !crypto.verify(null, signingBytes(packet, anchor), publicKey, signature)) {
    throw new Error('packet signature verification failed');
  }
  return true;
}

function readPacketFile(filePath, allowedRoot) {
  const resolvedFile = path.resolve(filePath);
  if (path.extname(resolvedFile).toLowerCase() !== '.json') {
    throw new Error('packet file must have a .json extension');
  }
  if (allowedRoot) {
    const resolvedRoot = fs.realpathSync(allowedRoot);
    const realFile = fs.realpathSync(resolvedFile);
    const relativeFile = path.relative(resolvedRoot, realFile);
    if (!relativeFile || relativeFile.startsWith(`..${path.sep}`) || relativeFile === '..'
        || path.isAbsolute(relativeFile)) {
      throw new Error('packet file must be inside the allowed packet directory');
    }
  }
  return JSON.parse(fs.readFileSync(resolvedFile, 'utf8'));
}

module.exports = {
  DEFAULT_ANCHOR,
  PACKET_TYPES,
  canonicalize,
  createSignedPacket,
  isValidTimestamp,
  readPacketFile,
  signingBytes,
  validatePacket,
  verifyPacketSignature,
};
