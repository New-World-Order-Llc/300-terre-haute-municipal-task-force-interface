'use strict';

const crypto = require('node:crypto');
const { createSignedPacket, DEFAULT_ANCHOR } = require('./packet_utils');

const EVENT_PACKET_TYPES = Object.freeze({
  TreasuryFunded: 'TREASURY_FUND',
  BudgetApproved: 'BUDGET_APPROVED',
  BudgetRevoked: 'BUDGET_REVOKED',
  FundsReleased: 'FUNDS_RELEASED',
  TaskForceCreated: 'TASKFORCE_NEW',
  TaskForceStatusChanged: 'TASKFORCE_STATUS',
  ProjectCreated: 'PROJECT_NEW',
  ProjectStatusChanged: 'PROJECT_STATUS',
  ProjectFunded: 'PROJECT_FUNDED',
});

function asString(value) {
  return value.toString();
}

function deterministicPacketId({ chainId, blockHash, transactionHash, logIndex }) {
  const digest = crypto.createHash('sha256')
    .update(`MUNISIBLE_EVENT_V1:${chainId}:${blockHash}:${transactionHash}:${logIndex}`)
    .digest();
  digest[6] = (digest[6] & 0x0f) | 0x50;
  digest[8] = (digest[8] & 0x3f) | 0x80;
  const hex = digest.subarray(0, 16).toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

async function mapEventPayload(eventName, args, actor, context, readers) {
  const payload = {
    network_chain_id: asString(context.chainId),
    block_number: context.blockNumber,
    block_hash: context.blockHash,
    tx_hash: context.transactionHash,
    log_index: context.logIndex,
  };

  switch (eventName) {
    case 'TreasuryFunded':
      Object.assign(payload, {
        from: args.from,
        amount: asString(args.amount),
        treasury_balance: asString(await readers.treasuryBalance()),
      });
      break;
    case 'BudgetApproved':
    case 'BudgetRevoked':
      Object.assign(payload, {
        module: args.module,
        amount: asString(args.amount),
        new_module_budget: asString(await readers.moduleBudget(args.module)),
      });
      break;
    case 'FundsReleased':
      Object.assign(payload, {
        module: args.module,
        amount: asString(args.amount),
        treasury_balance: asString(await readers.treasuryBalance()),
        module_balance: asString(await readers.moduleBalance(args.module)),
      });
      break;
    case 'TaskForceCreated':
      Object.assign(payload, {
        task_force_id: asString(args.id),
        name: args.name,
        jurisdiction: args.jurisdiction,
        created_by: actor,
      });
      break;
    case 'TaskForceStatusChanged':
      Object.assign(payload, {
        task_force_id: asString(args.id),
        active: args.active,
        changed_by: actor,
      });
      break;
    case 'ProjectCreated': {
      const project = await readers.project(args.id);
      Object.assign(payload, {
        project_id: asString(args.id),
        task_force_id: asString(args.taskForceId),
        name: args.name,
        description: project.description,
        budget_lucr: asString(args.budgetLucr),
        created_by: actor,
      });
      break;
    }
    case 'ProjectStatusChanged':
      Object.assign(payload, {
        project_id: asString(args.id),
        active: args.active,
        changed_by: actor,
      });
      break;
    case 'ProjectFunded': {
      const project = await readers.project(args.projectId);
      Object.assign(payload, {
        project_id: asString(args.projectId),
        recipient: args.recipient,
        amount_lucr: asString(args.amountLucr),
        spent_lucr: asString(project.spentLucr),
        budget_lucr: asString(project.budgetLucr),
      });
      break;
    }
    default:
      throw new Error(`unsupported contract event: ${eventName}`);
  }
  return payload;
}

async function buildEventPacket({
  eventName,
  args,
  actor,
  context,
  readers,
  privateKey,
  anchor = DEFAULT_ANCHOR,
  timestamp,
}) {
  const packetType = EVENT_PACKET_TYPES[eventName];
  if (!packetType) {
    throw new Error(`unsupported contract event: ${eventName}`);
  }
  const payload = await mapEventPayload(eventName, args, actor, context, readers);
  return createSignedPacket({
    packet_id: deterministicPacketId({
      chainId: context.chainId,
      blockHash: context.blockHash,
      transactionHash: context.transactionHash,
      logIndex: context.logIndex,
    }),
    packet_type: packetType,
    timestamp,
    payload,
  }, privateKey, anchor);
}

module.exports = {
  EVENT_PACKET_TYPES,
  buildEventPacket,
  deterministicPacketId,
  mapEventPayload,
};
