import { beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { getAddressFromPrivateKey } from "@stacks/transactions";

const mocks = vi.hoisted(() => ({
  network: { name: "testnet", api: "https://api.testnet.hiro.so", deployer: "ST000000000000000000002AMW42H" },
  makeCall: vi.fn().mockResolvedValue({}), broadcast: vi.fn().mockResolvedValue({ txid: "test-transaction" }),
}));
vi.mock("../src/network.js", () => ({ chainNetwork: mocks.network }));
vi.mock("@stacks/transactions", async (importOriginal) => ({
  ...await importOriginal<typeof import("@stacks/transactions")>(),
  makeContractCall: mocks.makeCall, broadcastTransaction: mocks.broadcast,
}));
const TEST_KEY = "01".repeat(32);
const address = getAddressFromPrivateKey(TEST_KEY, "testnet");
const mainnetAddress = getAddressFromPrivateKey(TEST_KEY, "mainnet");
const api = setupServer(http.get(`https://api.testnet.hiro.so/extended/v1/address/${address}/nonces`, () =>
  HttpResponse.json({ possible_next_nonce: 7 })
));

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  mocks.network.name = "testnet";
  process.env["FAUCET_PRIVATE_KEY"] = TEST_KEY;
  process.env["FAUCET_MAX_DAILY_MINTS"] = "200";
});

async function withServer(fn: (url: string) => Promise<void>) {
  const { faucetRouter } = await import("../src/routes/faucet.js");
  const app = express(); app.use(express.json()); app.use("/faucet", faucetRouter);
  api.listen({ onUnhandledRequest: "bypass" });
  const listener = app.listen(0);
  const url = `http://127.0.0.1:${(listener.address() as { port: number }).port}/faucet`;
  try { await fn(url); } finally { listener.close(); api.close(); }
}
const post = (url: string, target: string) => fetch(url, {
  method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ address: target }),
});

describe("testnet faucet isolation", () => {
  it("serializes cooldown checks so concurrent requests mint only once", async () => {
    await withServer(async (url) => {
      const result = await Promise.all([post(url, address), post(url, address), post(url, address)]);
      expect(result.map((r) => r.status).sort()).toEqual([200, 429, 429]);
      expect(mocks.broadcast).toHaveBeenCalledTimes(1);
      expect(mocks.makeCall.mock.calls[0]![0].nonce).toBe(7n);
    });
  });
  it("does not reuse an oracle key when a dedicated faucet key is missing", async () => {
    delete process.env["FAUCET_PRIVATE_KEY"];
    process.env["ORACLE_PRIVATE_KEY"] = TEST_KEY;
    try {
      await withServer(async (url) => expect((await post(url, address)).status).toBe(503));
    } finally { delete process.env["ORACLE_PRIVATE_KEY"]; }
    expect(mocks.broadcast).not.toHaveBeenCalled();
  });
  it("rejects a mainnet recipient even on a testnet faucet", async () => {
    await withServer(async (url) => expect((await post(url, mainnetAddress)).status).toBe(400));
    expect(mocks.broadcast).not.toHaveBeenCalled();
  });
  it("never exposes a mainnet faucet", async () => {
    mocks.network.name = "mainnet";
    await withServer(async (url) => expect((await post(url, mainnetAddress)).status).toBe(403));
    expect(mocks.broadcast).not.toHaveBeenCalled();
  });
});
