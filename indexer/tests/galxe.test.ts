import { describe, it, expect, beforeAll, afterEach, afterAll } from "vitest";
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
const DEPLOYER = "SP000000000000000000002AMW42H";
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
afterEach(() => server.resetHandlers());
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
