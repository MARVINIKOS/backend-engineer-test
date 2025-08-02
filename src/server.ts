import Fastify from 'fastify';
import { createHash } from 'crypto';

const fastify = Fastify({ logger: false });

interface Output {
  address: string;
  value: number;
}

interface Input {
  txId: string;
  index: number;
}

interface Transaction {
  id: string;
  inputs: Input[];
  outputs: Output[];
}

interface Block {
  id: string;
  height: number;
  transactions: Transaction[];
}

let blockchain: Block[] = [];
let utxos: Map<string, Output> = new Map();
let balances: Map<string, number> = new Map();

function sha256(data: string): string {
  return createHash('sha256').update(data).digest('hex');
}

function getBlockHash(height: number, txs: Transaction[]): string {
  const txIdsConcat = txs.map((tx) => tx.id).join('');
  return sha256(height + txIdsConcat);
}

fastify.post('/blocks', async (request, reply) => {
  const block = request.body as Block;

  if (block.height !== blockchain.length + 1) {
    return reply.code(400).send({ error: 'Invalid block height' });
  }

  const expectedHash = getBlockHash(block.height, block.transactions);
  if (block.id !== expectedHash) {
    return reply.code(400).send({ error: 'Invalid block id hash' });
  }

  let inputSum = 0;
  let outputSum = 0;
  const tempSpent: string[] = [];
  const tempAdded: [string, Output][] = [];

  for (const tx of block.transactions) {
    if (tx.inputs.length > 0) {
      for (const input of tx.inputs) {
        const key = `${input.txId}:${input.index}`;
        const utxo = utxos.get(key);
        if (!utxo) {
          return reply.code(400).send({ error: `Input not found: ${key}` });
        }
        inputSum += utxo.value;
        balances.set(utxo.address, (balances.get(utxo.address) || 0) - utxo.value);
        utxos.delete(key);
        tempSpent.push(key);
      }
    }

    tx.outputs.forEach((output, index) => {
      const key = `${tx.id}:${index}`;
      utxos.set(key, output);
      balances.set(output.address, (balances.get(output.address) || 0) + output.value);
      tempAdded.push([key, output]);
      outputSum += output.value;
    });
  }

  if (inputSum !== outputSum && inputSum !== 0) {
    // rollback in case of mismatch (only fail if NOT a coinbase tx)
    tempSpent.forEach((key) => {
      const output = utxos.get(key);
      if (output) {
        balances.set(output.address, (balances.get(output.address) || 0) + output.value);
        utxos.set(key, output);
      }
    });
    tempAdded.forEach(([key]) => {
      utxos.delete(key);
    });
    return reply.code(400).send({ error: 'Input and output sums do not match' });
  }

  blockchain.push(block);
  return reply.code(200).send({ ok: true });
});

fastify.get('/balance/:address', async (request, reply) => {
  const { address } = request.params as { address: string };
  const balance = balances.get(address) || 0;
  return reply.send({ balance });
});

fastify.post('/rollback', async (request, reply) => {
  const height = parseInt((request.query as any).height);
  if (isNaN(height) || height < 0 || height > blockchain.length) {
    return reply.code(400).send({ error: 'Invalid rollback height' });
  }

  blockchain = blockchain.slice(0, height);
  utxos = new Map();
  balances = new Map();

  for (const block of blockchain) {
    for (const tx of block.transactions) {
      if (tx.inputs.length > 0) {
        for (const input of tx.inputs) {
          const key = `${input.txId}:${input.index}`;
          const output = utxos.get(key);
          if (output) {
            balances.set(output.address, (balances.get(output.address) || 0) - output.value);
            utxos.delete(key);
          }
        }
      }
      tx.outputs.forEach((output, index) => {
        const key = `${tx.id}:${index}`;
        utxos.set(key, output);
        balances.set(output.address, (balances.get(output.address) || 0) + output.value);
      });
    }
  }

  return reply.send({ ok: true });
});

export default fastify;
