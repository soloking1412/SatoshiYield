import { describe, it, expect, beforeAll, afterEach, afterAll } from "vitest";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { getAddressFromPrivateKey } from "@stacks/transactions";

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
 * Build a minimal `(some { ... })` hex stub. We only need the first byte to
 * be 0a (some) for the eligibility check and a syntactically valid tuple body
 * for the decodePrincipalAmount helper. This mirrors what the Stacks API
 * returns for a real position.
 *
 * Layout (binary, then hex):
 *   0a        – (some)
 *   0c        – tuple
 *   00000006  – 6 fields
 *   07 "adapter" 05 01 <20 zero bytes>  – principal (type 05, version 01)
 *   08 "claim-id" 01 <16 zero bytes>    – uint
 *   0c "deposited-at" 01 <16 zero bytes>
 *   08 "is-async" 03                    – bool false
 *   10 "principal-amount" 01 <15 zero bytes + amount byte>
 *   06 "status" 01 <16 zero bytes>
 */
function somePosition(sats: number): string {
  const b: number[] = [];
  const push = (...bytes: number[]) => b.push(...bytes);
  const pushStr = (s: string) => push(s.length, ...Array.from(s).map((c) => c.charCodeAt(0)));
  const uint128 = (n: number) => {
    const arr = new Array(16).fill(0);
    arr[15] = n & 0xff;
    arr[14] = (n >> 8) & 0xff;
    arr[13] = (n >> 16) & 0xff;
    arr[12] = (n >> 24) & 0xff;
    return arr;
  };

  push(0x0a);         // (some)
  push(0x0c);         // tuple
  push(0, 0, 0, 6);  // 6 fields

  // Field 1: adapter (principal)
  pushStr("adapter");
  push(0x05, 0x01, ...new Array(20).fill(0));

  // Field 2: claim-id (uint)
  pushStr("claim-id");
  push(0x01, ...uint128(0));

  // Field 3: deposited-at (uint)
  pushStr("deposited-at");
  push(0x01, ...uint128(0));

  // Field 4: is-async (bool false)
  pushStr("is-async");
  push(0x03);

  // Field 5: principal-amount (uint) — the value we want
  pushStr("principal-amount");
  push(0x01, ...uint128(sats));

  // Field 6: status (uint)
  pushStr("status");
  push(0x01, ...uint128(1));

  return "0x" + b.map((x) => x.toString(16).padStart(2, "0")).join("");
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
