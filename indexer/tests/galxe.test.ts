import { describe, it, expect, beforeAll, afterEach, afterAll, vi } from "vitest";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import {
  getAddressFromPrivateKey,
  serializeCV,
  tupleCV,
  uintCV,
  boolCV,
  someCV,
  contractPrincipalCV,
} from "@stacks/transactions";

// Must match vitest.config.ts env
const DEPLOYER = "SP000000000000000000002Q6VF78";
const API = "https://api.hiro.so";

// Valid mainnet addresses derived from known private keys — guarantees correct
// c32check checksums without relying on hard-coded strings that may be invalid.
const DEPOSITOR = getAddressFromPrivateKey(
  "0101010101010101010101010101010101010101010101010101010101010101",
  "mainnet"
);
const STRANGER = getAddressFromPrivateKey(
  "0202020202020202020202020202020202020202020202020202020202020202",
  "mainnet"
);

function positionUrl(): string {
  return `${API}/v2/contracts/call-read/${DEPLOYER}/vault-v6/get-position`;
}

/**
 * Build a real `(some { ... })` position serialization using the Stacks lib —
 * matching vault-v6's user-position tuple shape exactly (the adapter is a
 * CONTRACT principal, mirroring SP....zest-earn-adapter on mainnet).
 */
// A valid mainnet principal for the adapter contract in the position tuple.
// (The synthetic DEPLOYER burn address fails c32 validation in contractPrincipalCV.)
const ADAPTER_OWNER = getAddressFromPrivateKey(
  "0303030303030303030303030303030303030303030303030303030303030303",
  "mainnet"
);

function somePosition(sats: number): string {
  const cv = someCV(
    tupleCV({
      adapter: contractPrincipalCV(ADAPTER_OWNER, "zest-earn-adapter"),
      "claim-id": uintCV(0),
      "deposited-at": uintCV(8_304_829),
      "is-async": boolCV(false),
      "principal-amount": uintCV(sats),
      status: uintCV(0),
    })
  );
  return "0x" + serializeCV(cv);
}

/** `none` — address has no position */
const NONE_HEX = "0x09";


// Default: return a live position for any chain call. Individual tests override
// with server.use() when they need a different response.
const server = setupServer(
  http.post(positionUrl(), () =>
    HttpResponse.json({ okay: true, result: somePosition(2500) })
  )
);

// Import the router's internals via the running express app for integration tests.
// We test via HTTP against a real express instance to avoid mocking the router itself.
import express from "express";
import { galxeRouter } from "../src/routes/galxe.js";

const app = express();
app.use(express.json());
app.use("/api/galxe", galxeRouter);

function get(path: string): Promise<Response> {
  return new Promise((resolve, reject) => {
    const server = app.listen(0, () => {
      const port = (server.address() as { port: number }).port;
      fetch(`http://127.0.0.1:${port}${path}`)
        .then(resolve, reject)
        .finally(() => server.close());
    });
    server.on("error", reject);
  });
}

// "bypass" lets the local express server requests pass through MSW un-intercepted
// while still intercepting Stacks API calls via the handlers above.
beforeAll(() => server.listen({ onUnhandledRequest: "bypass" }));
afterEach(() => { server.resetHandlers(); vi.unstubAllEnvs(); });
afterAll(() => server.close());

describe("GET /api/galxe/check", () => {
  it("returns is_eligible=true for an address with an active position", async () => {
    const res = await get(`/api/galxe/check?address=${DEPOSITOR}`);
    expect(res.status).toBe(200);
    const body = await res.json() as { is_eligible: boolean; deposited_sats: number };
    expect(body.is_eligible).toBe(true);
    expect(body.deposited_sats).toBe(2500);
  });

  it("returns is_eligible=false for an address with no position", async () => {
    server.use(http.post(positionUrl(), () => HttpResponse.json({ okay: true, result: NONE_HEX })));
    const res = await get(`/api/galxe/check?address=${STRANGER}`);
    expect(res.status).toBe(200);
    const body = await res.json() as { is_eligible: boolean };
    expect(body.is_eligible).toBe(false);
  });

  it("returns 400 for a missing address", async () => {
    const res = await get("/api/galxe/check");
    expect(res.status).toBe(400);
  });

  it("returns 400 for a garbage address", async () => {
    const res = await get("/api/galxe/check?address=notanaddress");
    expect(res.status).toBe(400);
  });

  it("returns 400 for a contract principal (not a depositor wallet)", async () => {
    const res = await get(`/api/galxe/check?address=${DEPLOYER}.vault-v6`);
    expect(res.status).toBe(400);
  });

  it.each(["0x0a03", "0x09ff", "0x", "0x0a0c00000000"])('returns unavailable for malformed optional position %s', async result => {
    server.use(http.post(positionUrl(), () => HttpResponse.json({ okay: true, result })));
    expect((await get(`/api/galxe/check?address=${DEPOSITOR}`)).status).toBe(503);
  });
  it('rejects truthy nonboolean RPC success and zero-principal eligibility', async () => {
    server.use(http.post(positionUrl(), () => HttpResponse.json({ okay: "true", result: somePosition(2500) })));
    expect((await get(`/api/galxe/check?address=${DEPOSITOR}`)).status).toBe(503);
    server.use(http.post(positionUrl(), () => HttpResponse.json({ okay: true, result: somePosition(0) })));
    expect(await (await get(`/api/galxe/check?address=${DEPOSITOR}`)).json()).toMatchObject({is_eligible:false,deposited_sats:0});
  });
  it('rejects valid wallets on another network', async () => {
    expect((await get('/api/galxe/check?address=ST000000000000000000002AMW42H')).status).toBe(400);
  });
  it('requires an explicit v7 adapter list and aggregates each adapter exactly once', async () => {
    vi.stubEnv('VAULT_VERSION','v7'); vi.stubEnv('VAULT_NAME','vault-v7');
    expect((await get(`/api/galxe/check?address=${DEPOSITOR}`)).status).toBe(503);
    vi.stubEnv('VAULT_ADAPTERS',`${ADAPTER_OWNER}.a,${ADAPTER_OWNER}.b`);
    const calls:string[][]=[];
    server.use(http.post(`${API}/v2/contracts/call-read/${DEPLOYER}/vault-v7/get-position`, async ({request}) => {
      const body=await request.json() as {arguments:string[]}; calls.push(body.arguments);
      return HttpResponse.json({okay:true,result:somePosition(2500)});
    }));
    expect(await (await get(`/api/galxe/check?address=${DEPOSITOR}`)).json()).toMatchObject({is_eligible:true,deposited_sats:5000});
    expect(calls).toHaveLength(2); expect(calls.every(args=>args.length===2)).toBe(true);
    expect(calls[0]![1]).not.toBe(calls[1]![1]);
    vi.stubEnv('VAULT_ADAPTERS',`${ADAPTER_OWNER}.a,${ADAPTER_OWNER}.a`);
    expect((await get(`/api/galxe/check?address=${DEPOSITOR}`)).status).toBe(503);
  });
  it("returns 503 when the chain is unreachable", async () => {
    server.use(
      http.post(positionUrl(), () => HttpResponse.error())
    );
    const res = await get(`/api/galxe/check?address=${DEPOSITOR}`);
    expect(res.status).toBe(503);
  });

  it("returns 503 when the contract returns okay=false", async () => {
    server.use(
      http.post(positionUrl(), () =>
        HttpResponse.json({ okay: false, result: "" })
      )
    );
    const res = await get(`/api/galxe/check?address=${DEPOSITOR}`);
    expect(res.status).toBe(503);
  });
});
