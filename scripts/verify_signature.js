'use strict';

const { DEFAULT_ANCHOR, readPacketFile, verifyPacketSignature } = require('./packet_utils');

function main() {
  const packetPath = process.argv[2];
  if (!packetPath) {
    throw new Error('usage: node scripts/verify_signature.js <packet.json>');
  }
  const packet = readPacketFile(packetPath);
  const anchor = process.env.WALLET_ANCHOR_ID || DEFAULT_ANCHOR;
  verifyPacketSignature(packet, process.env.SIGNING_PUBLIC_KEY, anchor);
  process.stdout.write(`Valid ${packet.packet_type} packet ${packet.packet_id}\n`);
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}

module.exports = { main };
