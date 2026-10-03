'use strict';

const fs = require('node:fs');
const { DEFAULT_ANCHOR, createSignedPacket } = require('./packet_utils');

function main() {
  const inputPath = process.argv[2];
  if (!inputPath) {
    throw new Error('usage: node scripts/create_packet.js <unsigned-packet.json>');
  }
  const unsignedPacket = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
  const anchor = process.env.WALLET_ANCHOR_ID || DEFAULT_ANCHOR;
  const signedPacket = createSignedPacket(unsignedPacket, process.env.SIGNING_PRIVATE_KEY, anchor);
  process.stdout.write(`${JSON.stringify(signedPacket, null, 2)}\n`);
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
