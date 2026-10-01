import { describe, it, expect, beforeAll, afterEach, afterAll } from "vitest";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { readUint, readUintFromContract, readAdapterOracleState } from "../src/fetchers/chain.js";

const ADDRESS = "SP000000000000000000002Q6VF78";
const ROOT = `https://api.hiro.so/v2/contracts/call-read/${ADDRESS}/zest-earn-adapter`;
const uint = "00000000000000000000000000000154";
const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe("strict chain data validation", () => {
  it.each([
    `0x0700${uint}`, // signed int masquerading as uint
    `0x0801${uint}`, // error code masquerading as APY
    "0x070101", // truncated uint
    `0x0701${uint}01`, // trailing data
    `0x0701${"f".repeat(32)}`, // unsafe integer
    `0x0701${"z".repeat(32)}`, // non-hex
  ])("rejects invalid Clarity uint serialization %s", async (result) => {
    server.use(http.post(`${ROOT}/get-apy`, () => HttpResponse.json({ okay: true, result })));
    await expect(readUint("zest-earn-adapter", "get-apy")).rejects.toThrow();
  });
  it.each(["true", 1, {}, null])("requires boolean okay=true, not %s", async (okay) => {
    server.use(http.post(`${ROOT}/get-apy`, () => HttpResponse.json({ okay, result: `0x0701${uint}` })));
    await expect(readUint("zest-earn-adapter", "get-apy")).rejects.toThrow();
  });
  it("accepts a bare uint only through the flexible foreign-contract reader", async () => {
    server.use(http.post(`${ROOT}/get-apy`, () => HttpResponse.json({ okay: true, result: `0x01${uint}` })));
    expect(await readUintFromContract(ADDRESS, "zest-earn-adapter", "get-apy")).toBe(340);
    await expect(readUint("zest-earn-adapter", "get-apy")).rejects.toThrow();
  });
  it("marks a valid APY stale if its last-updated-block cannot be established", async () => {
    server.use(
      http.post(`${ROOT}/get-apy`, () => HttpResponse.json({ okay: true, result: `0x0701${uint}` })),
      http.post(`${ROOT}/get-last-updated-block`, () => HttpResponse.error())
    );
    expect((await readAdapterOracleState("zest-earn-adapter")).isStale).toBe(true);
  });
});
