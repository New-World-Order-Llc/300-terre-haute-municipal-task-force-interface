'use strict';

const fs = require('node:fs');
const path = require('node:path');
const {
  Contract,
  Interface,
  JsonRpcProvider,
  isAddress,
} = require('ethers');
const { DEFAULT_ANCHOR, verifyPacketSignature } = require('./packet_utils');
const { buildEventPacket, EVENT_PACKET_TYPES } = require('./packet_bridge_utils');

const TREASURY_ABI = [
  'event TreasuryFunded(address indexed from, uint256 amount)',
  'event BudgetApproved(address indexed module, uint256 amount)',
  'event BudgetRevoked(address indexed module, uint256 amount)',
  'event FundsReleased(address indexed module, uint256 amount)',
  'function moduleBudgets(address) view returns (uint256)',
  'function lucr() view returns (address)',
];
const TASK_FORCE_ABI = [
  'event TaskForceCreated(uint256 indexed id, string name, string jurisdiction)',
  'event TaskForceStatusChanged(uint256 indexed id, bool active)',
  'event ProjectCreated(uint256 indexed id, uint256 indexed taskForceId, string name, uint256 budgetLucr)',
  'event ProjectStatusChanged(uint256 indexed id, bool active)',
  'event ProjectFunded(uint256 indexed projectId, address indexed recipient, uint256 amountLucr)',
  'function projects(uint256) view returns (uint256 id, uint256 taskForceId, string name, string description, uint256 budgetLucr, uint256 spentLucr, bool active)',
  'function lucr() view returns (address)',
];

function requiredEnv(env, name) {
  const value = env[name];
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${name} is required`);
  }
  return value.trim();
}

function integerEnv(env, name, defaultValue, minimum = 0) {
  const rawValue = env[name] === undefined ? String(defaultValue) : env[name];
  if (!/^\d+$/.test(rawValue)) {
    throw new Error(`${name} must be a non-negative integer`);
  }
  const value = Number(rawValue);
  if (!Number.isSafeInteger(value) || value < minimum) {
    throw new Error(`${name} must be at least ${minimum}`);
  }
  return value;
}

function loadConfig(env = process.env) {
  const treasuryAddress = requiredEnv(env, 'TREASURY_ADDRESS');
  const taskForceAddress = requiredEnv(env, 'TASKFORCE_ADDRESS');
  if (!isAddress(treasuryAddress) || !isAddress(taskForceAddress)) {
    throw new Error('TREASURY_ADDRESS and TASKFORCE_ADDRESS must be valid addresses');
  }
  if (treasuryAddress.toLowerCase() === taskForceAddress.toLowerCase()) {
    throw new Error('TREASURY_ADDRESS and TASKFORCE_ADDRESS must be different contracts');
  }
  return {
    rpcUrl: requiredEnv(env, 'RPC_URL'),
    treasuryAddress,
    taskForceAddress,
    startBlock: integerEnv(env, 'BRIDGE_START_BLOCK', undefined),
    confirmations: integerEnv(env, 'BRIDGE_CONFIRMATIONS', 2, 1),
    blockRange: integerEnv(env, 'BRIDGE_BLOCK_RANGE', 500, 1),
    cursorFile: path.resolve(env.BRIDGE_CURSOR_FILE || '.bridge-cursor.json'),
    packetDirectory: path.resolve(env.PACKET_OUTPUT_DIR || 'packets'),
    privateKey: requiredEnv(env, 'SIGNING_PRIVATE_KEY'),
    publicKey: requiredEnv(env, 'SIGNING_PUBLIC_KEY'),
    anchor: env.WALLET_ANCHOR_ID || DEFAULT_ANCHOR,
  };
}

function packetEvents(iface) {
  return iface.fragments
    .filter((fragment) => fragment.type === 'event' && EVENT_PACKET_TYPES[fragment.name])
    .map((fragment) => iface.getEvent(fragment.name).topicHash);
}

function loadCursor(config, chainId) {
  const identity = {
    chainId: chainId.toString(),
    treasuryAddress: config.treasuryAddress.toLowerCase(),
    taskForceAddress: config.taskForceAddress.toLowerCase(),
    startBlock: config.startBlock,
  };
  if (!fs.existsSync(config.cursorFile)) {
    return { ...identity, lastBlock: config.startBlock - 1 };
  }
  const cursor = JSON.parse(fs.readFileSync(config.cursorFile, 'utf8'));
  if (Object.keys(identity).some((key) => cursor[key] !== identity[key])
      || !Number.isSafeInteger(cursor.lastBlock) || cursor.lastBlock < config.startBlock - 1) {
    throw new Error('bridge cursor does not match configured chain/contracts/start block');
  }
  return cursor;
}

function saveCursor(cursorPath, cursor) {
  fs.mkdirSync(path.dirname(cursorPath), { recursive: true });
  const temporaryPath = `${cursorPath}.${process.pid}.tmp`;
  fs.writeFileSync(temporaryPath, `${JSON.stringify(cursor)}\n`, { mode: 0o600 });
  fs.renameSync(temporaryPath, cursorPath);
}

function persistPacket(packetDirectory, packet) {
  fs.mkdirSync(packetDirectory, { recursive: true });
  const packetPath = path.join(packetDirectory, `${packet.packet_id}.json`);
  const serialized = `${JSON.stringify(packet, null, 2)}\n`;
  try {
    fs.writeFileSync(packetPath, serialized, { flag: 'wx', mode: 0o600 });
  } catch (error) {
    if (error.code !== 'EEXIST') {
      throw error;
    }
    const existingPacket = JSON.parse(fs.readFileSync(packetPath, 'utf8'));
    if (JSON.stringify(existingPacket) !== JSON.stringify(packet)) {
      throw new Error(`packet ID collision or changed event data for ${packet.packet_id}`);
    }
  }
  return packetPath;
}

async function main(env = process.env) {
  const config = loadConfig(env);
  const provider = new JsonRpcProvider(config.rpcUrl);
  const treasuryInterface = new Interface(TREASURY_ABI);
  const taskForceInterface = new Interface(TASK_FORCE_ABI);
  const treasury = new Contract(config.treasuryAddress, TREASURY_ABI, provider);
  const taskForce = new Contract(config.taskForceAddress, TASK_FORCE_ABI, provider);
  let stopped = false;
  const requestStop = () => { stopped = true; };
  process.once('SIGINT', requestStop);
  process.once('SIGTERM', requestStop);

  try {
    const network = await provider.getNetwork();
    const chainId = network.chainId;
    const cursor = loadCursor(config, chainId);
    if (cursor.lastBlock > await provider.getBlockNumber()) {
      throw new Error('bridge cursor is ahead of the configured chain head');
    }
    const treasuryToken = await treasury.lucr();
    const taskForceToken = await taskForce.lucr();
    if (treasuryToken.toLowerCase() !== taskForceToken.toLowerCase()) {
      throw new Error('Treasury and task-force contracts are configured with different LUCR tokens');
    }
    const token = new Contract(treasuryToken, [
      'function balanceOf(address) view returns (uint256)',
    ], provider);
    const topics = [
      ...packetEvents(treasuryInterface),
      ...packetEvents(taskForceInterface),
    ];
    const eventContracts = new Map([
      [config.treasuryAddress.toLowerCase(), { iface: treasuryInterface }],
      [config.taskForceAddress.toLowerCase(), { iface: taskForceInterface }],
    ]);
    while (!stopped) {
      const latestBlock = await provider.getBlockNumber();
      const confirmedThrough = latestBlock - config.confirmations + 1;
      const fromBlock = cursor.lastBlock + 1;
      if (confirmedThrough < fromBlock) {
        await new Promise((resolve) => setTimeout(resolve, 5000));
        continue;
      }
      const toBlock = Math.min(confirmedThrough, fromBlock + config.blockRange - 1);
      const logs = await provider.getLogs({
        address: [config.treasuryAddress, config.taskForceAddress],
        topics: [topics],
        fromBlock,
        toBlock,
      });
      logs.sort((a, b) => a.blockNumber - b.blockNumber || a.index - b.index);
      const blockCache = new Map();

      for (const log of logs) {
        const source = eventContracts.get(log.address.toLowerCase());
        if (!source) {
          continue;
        }
        const parsed = source.iface.parseLog(log);
        if (!parsed || !EVENT_PACKET_TYPES[parsed.name]) {
          continue;
        }
        let block = blockCache.get(log.blockNumber);
        if (!block) {
          block = await provider.getBlock(log.blockNumber);
          if (!block) {
            throw new Error(`could not retrieve block ${log.blockNumber}`);
          }
          blockCache.set(log.blockNumber, block);
        }
        const transaction = await provider.getTransaction(log.transactionHash);
        if (!transaction) {
          throw new Error(`could not retrieve transaction ${log.transactionHash}`);
        }
        const args = Object.fromEntries(parsed.fragment.inputs.map((input, index) => [
          input.name, parsed.args[index],
        ]));
        const blockTag = log.blockNumber;
        const readers = {
          treasuryBalance: () => token.balanceOf(config.treasuryAddress, { blockTag }),
          moduleBalance: (module) => token.balanceOf(module, { blockTag }),
          moduleBudget: (module) => treasury.moduleBudgets(module, { blockTag }),
          project: async (projectId) => {
            const project = await taskForce.projects(projectId, { blockTag });
            return { description: project.description, budgetLucr: project.budgetLucr, spentLucr: project.spentLucr };
          },
        };
        const packet = await buildEventPacket({
          eventName: parsed.name,
          args,
          actor: transaction.from,
          context: {
            chainId,
            blockNumber: log.blockNumber,
            blockHash: log.blockHash,
            transactionHash: log.transactionHash,
            logIndex: log.index,
          },
          readers,
          privateKey: config.privateKey,
          anchor: config.anchor,
          timestamp: new Date(block.timestamp * 1000).toISOString(),
        });
        verifyPacketSignature(packet, config.publicKey, config.anchor);
        const packetPath = persistPacket(config.packetDirectory, packet);
        process.stdout.write(`Created ${packet.packet_type} packet ${packet.packet_id}: ${packetPath}\n`);
      }

      cursor.lastBlock = toBlock;
      saveCursor(config.cursorFile, cursor);
    }
  } finally {
    process.removeListener('SIGINT', requestStop);
    process.removeListener('SIGTERM', requestStop);
    await provider.destroy();
  }
}

if (require.main === module) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}

module.exports = {
  EVENT_PACKET_TYPES,
  loadConfig,
  loadCursor,
  main,
  persistPacket,
  saveCursor,
};
