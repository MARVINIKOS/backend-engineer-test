import { expect, test, beforeAll, afterAll } from 'bun:test';
import server from '../src/server';

let serverInstance: any;

beforeAll(async () => {
  serverInstance = await server.listen({ port: 3000 });
});

afterAll(async () => {
  await serverInstance.close?.();
});

test("assignment example scenario and rollback", async () => {
  // Block 1 - addr1 gets 10
  const block1 = {
    id: "",
    height: 1,
    transactions: [{
      id: "tx1",
      inputs: [],
      outputs: [{ address: "addr1", value: 10 }]
    }]
  };
  block1.id = sha256("1tx1");

  let res = await fetch("http://localhost:3000/blocks", {
    method: "POST",
    body: JSON.stringify(block1),
    headers: { "Content-Type": "application/json" }
  });
  expect(res.status).toBe(200);

  // Block 2 - addr1 -> addr2 (4), addr3 (6)
  const block2 = {
    id: "",
    height: 2,
    transactions: [{
      id: "tx2",
      inputs: [{ txId: "tx1", index: 0 }],
      outputs: [
        { address: "addr2", value: 4 },
        { address: "addr3", value: 6 }
      ]
    }]
  };
  block2.id = sha256("2tx2");

  res = await fetch("http://localhost:3000/blocks", {
    method: "POST",
    body: JSON.stringify(block2),
    headers: { "Content-Type": "application/json" }
  });
  expect(res.status).toBe(200);

  // Block 3 - addr3 -> addr4, addr5, addr6 (2 each)
  const block3 = {
    id: "",
    height: 3,
    transactions: [{
      id: "tx3",
      inputs: [{ txId: "tx2", index: 1 }],
      outputs: [
        { address: "addr4", value: 2 },
        { address: "addr5", value: 2 },
        { address: "addr6", value: 2 }
      ]
    }]
  };
  block3.id = sha256("3tx3");

  res = await fetch("http://localhost:3000/blocks", {
    method: "POST",
    body: JSON.stringify(block3),
    headers: { "Content-Type": "application/json" }
  });
  expect(res.status).toBe(200);

  // Check balances
  const getBalance = async (addr: string) =>
    (await (await fetch(`http://localhost:3000/balance/${addr}`)).json()).balance;

  expect(await getBalance("addr1")).toBe(0);
  expect(await getBalance("addr2")).toBe(4);
  expect(await getBalance("addr3")).toBe(0);
  expect(await getBalance("addr4")).toBe(2);
  expect(await getBalance("addr5")).toBe(2);
  expect(await getBalance("addr6")).toBe(2);

  // Rollback to height 2
  res = await fetch("http://localhost:3000/rollback?height=2", { method: "POST" });
  expect(res.status).toBe(200);

  // Balances after rollback
  expect(await getBalance("addr1")).toBe(0);
  expect(await getBalance("addr2")).toBe(4);
  expect(await getBalance("addr3")).toBe(6);
  expect(await getBalance("addr4")).toBe(0);
  expect(await getBalance("addr5")).toBe(0);
  expect(await getBalance("addr6")).toBe(0);
});

// Minimal hash function (same as server)
function sha256(data: string): string {
  const crypto = require('crypto');
  return crypto.createHash("sha256").update(data).digest("hex");
}
