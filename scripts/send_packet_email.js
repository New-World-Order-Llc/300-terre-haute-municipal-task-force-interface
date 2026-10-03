'use strict';

const nodemailer = require('nodemailer');
const { DEFAULT_ANCHOR, readPacketFile, validatePacket, verifyPacketSignature } = require('./packet_utils');

async function sendPacket(packet, cityEmail, env = process.env, transportFactory = nodemailer.createTransport) {
  validatePacket(packet);
  if (!cityEmail || !env.SYSTEM_EMAIL) {
    throw new Error('CITY_ENDPOINT_EMAIL and SYSTEM_EMAIL are required');
  }
  const anchor = env.WALLET_ANCHOR_ID || DEFAULT_ANCHOR;
  verifyPacketSignature(packet, env.SIGNING_PUBLIC_KEY, anchor);

  const port = Number(env.SMTP_PORT);
  if (!env.SMTP_HOST || !Number.isInteger(port) || port < 1 || port > 65535
      || !env.SMTP_USER || !env.SMTP_PASS) {
    throw new Error('SMTP_HOST, SMTP_PORT, SMTP_USER, and SMTP_PASS are required');
  }
  const secure = port === 465;
  const transporter = transportFactory({
    host: env.SMTP_HOST,
    port,
    secure,
    requireTLS: !secure,
    auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
  });

  const subject = `${packet.packet_type}:${packet.packet_id}:${packet.timestamp}`;
  await transporter.sendMail({
    from: env.SYSTEM_EMAIL,
    to: cityEmail,
    subject,
    text: JSON.stringify(packet, null, 2),
    headers: { 'X-Integration-Notice': 'Integration module; not an official City communication' },
  });
}

async function main() {
  const packetPath = process.env.PACKET_FILE || process.argv[2];
  if (!packetPath) {
    throw new Error('usage: node scripts/send_packet_email.js <packet.json>');
  }
  const allowedRoot = process.env.PACKET_DIRECTORY;
  const packet = readPacketFile(packetPath, allowedRoot);
  await sendPacket(packet, process.env.CITY_ENDPOINT_EMAIL);
  process.stdout.write(`Sent ${packet.packet_type} packet ${packet.packet_id}\n`);
}

if (require.main === module) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}

module.exports = { main, sendPacket };
