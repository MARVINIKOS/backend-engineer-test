// src/index.ts
import Fastify from 'fastify';
import { createHash } from 'crypto';

const fastify = Fastify({ logger: true });

// In-memory state
let currentHeight = 0;
const blocks: any[] = [];
const transactions = new Map<string, any>();
const unspentOutputs = new Map<string, any>();
const balances = new Map<string, number>();

function sha256(data: string): string {
  return createHash('sha256').update(data).digest('hex');
}

fastify.post('/blocks', async (request, reply) => {
  const block = request.body as {
    id: string,
    height: number,
    transactions: Array<any>
  };

  if (block.height !== currentHeight + 1) {
    return reply.status(400).send({ error: 'Invalid block height' });
  }

  const txIdsConcat = block.transactions.map(tx => tx.id).join('');
  const computedId = sha256(block.height + txIdsConcat);
  if (computedId !== block.id) {
    return reply.status(400).send({ error: 'Invalid block ID hash' });
  }

  // Validate and apply transactions
  for (const tx of block.transactions) {
    let inputTotal = 0;
    let outputTotal = 0;

    for (const input of tx.inputs || []) {
      const key = `${input.txId}:${input.index}`;
      const utxo = unspentOutputs.get(key);
      if (!utxo) return reply.status(400).send({ error: 'Invalid input UTXO' });
      inputTotal += utxo.value;
    }

    for (const output of tx.outputs || []) {
      outputTotal += output.value;
    }

    if (inputTotal !== outputTotal) {
      return reply.status(400).send({ error: 'Input/output mismatch' });
    }

    // Spend inputs
    for (const input of tx.inputs || []) {
      const key = `${input.txId}:${input.index}`;
      const utxo = unspentOutputs.get(key);
      unspentOutputs.delete(key);
      balances.set(utxo.address, (balances.get(utxo.address) || 0) - utxo.value);
    }

    // Create outputs
    tx.outputs.forEach((output, index) => {
      const key = `${tx.id}:${index}`;
      unspentOutputs.set(key, output);
      balances.set(output.address, (balances.get(output.address) || 0) + output.value);
    });

    transactions.set(tx.id, tx);
  }

  currentHeight++;
  blocks.push(block);
  return { message: 'Block accepted' };
});

fastify.get('/balance/:address', async (request, reply) => {
  const address = (request.params as any).address;
  const balance = balances.get(address) || 0;
  return { balance };
});

fastify.post('/rollback', async (request, reply) => {
  const height = Number((request.query as any).height);
  if (height >= currentHeight || height < 0) {
    return reply.status(400).send({ error: 'Invalid rollback height' });
  }

  // Keep a snapshot
  const snapshot = blocks.slice(0, height);
  // Reset all state
  currentHeight = 0;
  blocks.length = 0;
  transactions.clear();
  unspentOutputs.clear();
  balances.clear();

  // Re-apply up to the target height
  for (const block of snapshot) {
    await fastify.inject({ method: 'POST', url: '/blocks', payload: block });
  }

  return { message: `Rolled back to height ${height}` };
});

fastify.listen({ port: 3000 }, err => {
  if (err) throw err;
  console.log('Server running on http://localhost:3000');
});

export default fastify;
