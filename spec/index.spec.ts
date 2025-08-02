// spec/index.spec.ts
import { expect, test } from 'bun:test';
import Fastify from 'fastify';
import { createHash } from 'crypto';
import { AddressInfo } from 'net';

let server: Awaited<ReturnType<typeof Fastify>>;

function sha256(data: string): string {
  return createHash('sha256').update(data).digest('hex');
}

function createBlock(height: number, txs: any[]): any {
  const txIdsConcat = txs.map(tx => tx.id).join('');
  const id = sha256(height + txIdsConcat);
  return { id, height, transactions: txs };
}

test.beforeAll(async () => {
  server = (await import('../src/index')).default;
});

test('accepts valid block and returns correct balance', async () => {
  const block = createBlock(1, [
    {
      id: 'tx1',
      inputs: [],
      outputs: [{ address: 'addr1', value: 10 }]
    }
  ]);

  const res = await server.inject({ method: 'POST', url: '/blocks', payload: block });
  expect(res.statusCode).toBe(200);

  const balanceRes = await server.inject({ method: 'GET', url: '/balance/addr1' });
  expect(balanceRes.json().balance).toBe(10);
});

test('rejects block with invalid height', async () => {
  const block = createBlock(3, [
    {
      id: 'tx_fail1',
      inputs: [],
      outputs: [{ address: 'addrX', value: 5 }]
    }
  ]);

  const res = await server.inject({ method: 'POST', url: '/blocks', payload: block });
  expect(res.statusCode).toBe(400);
});

test('detects input/output value mismatch', async () => {
  const tx2 = {
    id: 'tx2',
    inputs: [{ txId: 'tx1', index: 0 }],
    outputs: [{ address: 'addr2', value: 6 }] // invalid, tx1 gave 10
  };
  const block2 = createBlock(2, [tx2]);

  const res = await server.inject({ method: 'POST', url: '/blocks', payload: block2 });
  expect(res.statusCode).toBe(400);
});

test('rolls back to previous block correctly', async () => {
  const tx2 = {
    id: 'tx3',
    inputs: [{ txId: 'tx1', index: 0 }],
    outputs: [
      { address: 'addr2', value: 5 },
      { address: 'addr3', value: 5 }
    ]
  };
  const block = createBlock(2, [tx2]);
  await server.inject({ method: 'POST', url: '/blocks', payload: block });

  await server.inject({ method: 'POST', url: '/rollback?height=1' });
  const res = await server.inject({ method: 'GET', url: '/balance/addr1' });
  expect(res.json().balance).toBe(10);
});
