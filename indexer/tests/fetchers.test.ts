import { describe, it, expect, beforeAll, afterEach, afterAll } from "vitest";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { fetchZest } from "../src/fetchers/zest.js";
import { __setHistory } from "../src/share-price.js";

// Test-only fake principal. Must match process.env.DEPLOYER_ADDRESS in
// vitest.config.ts; chain.ts has no defaults.
const DEPLOYER = "SP000000000000000000002AMW42H";
const API = "https://api.hiro.so";
const ZEST_ADDR = "SP1A27KFY4XERQCCRCARCYD1CC5N7M6688BSYADJ7";

function okUint(n: number): string {
  return "0x0701" + n.toString(16).padStart(32, "0");
}
function bareUint(n: bigint): string {
  return "0x01" + n.toString(16).padStart(32, "0");
}
function chainUrl(contract: string, fn: string): string {
  return `${API}/v2/contracts/call-read/${DEPLOYER}/${contract}/${fn}`;
}
function chainHandler(contract: string, fn: string, value: number) {
  return http.post(chainUrl(contract, fn), () =>
    HttpResponse.json({ okay: true, result: okUint(value) })
  );
}
function tvlHandler(slug: string, usd: number) {
  return http.get(`https://api.llama.fi/tvl/${slug}`, () => HttpResponse.json(usd));
}
// Zest vault share price (convert-to-assets of 1e8 shares) -> realized APY source.
function sharePriceHandler(price: number) {
  return http.post(
    `${API}/v2/contracts/call-read/${ZEST_ADDR}/v0-vault-sbtc/convert-to-assets`,
    () => HttpResponse.json({ okay: true, result: bareUint(BigInt(Math.round(price * 1e8))) })
  );
}

const server = setupServer(
  chainHandler("zest-earn-adapter", "get-apy", 340),
  chainHandler("zest-earn-adapter", "get-last-updated-block", 99_999),
  tvlHandler("zest-v2", 83_000_000),
  sharePriceHandler(1.001)
);

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => {
  server.resetHandlers();
  __setHistory([]);
});
afterAll(() => server.close());

describe("fetchZest (sync lending)", () => {
  it("returns the zest protocol id", async () => {
    expect((await fetchZest()).protocol).toBe("zest");
  });
  it("maps apy from on-chain (oracle-pushed) basis points", async () => {
    expect((await fetchZest()).apy_percent).toBe(3.4);
  });
  it("uses live DefiLlama protocol TVL", async () => {
    expect((await fetchZest()).tvl_usd).toBe(83_000_000);
  });
  it("is a live integration once on-chain share-price history exists", async () => {
    // a >= 24h-old snapshot below the current price -> realized APY computes
    __setHistory([{ t: Date.now() - 7 * 24 * 60 * 60 * 1000, p: 1.0 }]);
    expect((await fetchZest()).is_live_integration).toBe(true);
  });
  it("marks apy stale (no throw) when the chain returns a non-200", async () => {
    server.use(
      http.post(chainUrl("zest-earn-adapter", "get-apy"), () =>
        HttpResponse.json({ error: "not found" }, { status: 404 })
      )
    );
    expect((await fetchZest()).apy_stale).toBe(true);
  });

  it("does NOT false-flag stale on immaterial low-APY divergence (regression)", async () => {
    // Live mainnet bug: on-chain APY is low (17 bps) and the freshly-recomputed
    // native realized APY is a hair higher (~30 bps). That is a >50% deviation but
    // only ~0.13% apart — immaterial — and must NOT be flagged stale (a false flag
    // here greys out the whole yields table via YieldTable `allStale`).
    server.use(
      chainHandler("zest-earn-adapter", "get-apy", 17),
      sharePriceHandler(1.003) // vs a 1.0 anchor ~1yr old -> ~0.3% realized APY (~30 bps)
    );
    __setHistory([{ t: Date.now() - 365 * 24 * 60 * 60 * 1000, p: 1.0 }]);
    const y = await fetchZest();
    expect(y.is_live_integration).toBe(true);
    expect(y.apy_stale).toBe(false);
    expect(y.apy_percent).toBe(0.17);
  });

  it("still flags stale on a MATERIAL on-chain/native divergence (broken oracle)", async () => {
    // Guard preserved: on-chain 50 bps vs native ~8% (800 bps) is a real, material
    // divergence (>= 100 bps gap AND > 50%) -> flagged so the UI can warn.
    server.use(
      chainHandler("zest-earn-adapter", "get-apy", 50),
      sharePriceHandler(1.08) // vs a 1.0 anchor ~1yr old -> ~8% realized APY (~800 bps)
    );
    __setHistory([{ t: Date.now() - 365 * 24 * 60 * 60 * 1000, p: 1.0 }]);
    expect((await fetchZest()).apy_stale).toBe(true);
  });
});
