import { describe, it, expect, beforeAll, afterEach, afterAll } from "vitest";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { fetchZest } from "../src/fetchers/zest.js";
import { fetchHbtc } from "../src/fetchers/hbtc.js";

// Test-only fake principal. Must match process.env.DEPLOYER_ADDRESS in
// vitest.config.ts; chain.ts has no defaults.
const DEPLOYER = "SP000000000000000000002AMW42H";
const API = "https://api.hiro.so";
const ZEST_POOL = "f003d6df-fb8f-4a74-8cfb-aee8cc44f433";

function okUint(n: number): string {
  return "0x0701" + n.toString(16).padStart(32, "0");
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

const server = setupServer(
  // On-chain oracle state (the displayed APY).
  chainHandler("zest-earn-adapter", "get-apy", 340),
  chainHandler("zest-earn-adapter", "get-last-updated-block", 99_999),
  chainHandler("hermetica-hbtc-adapter", "get-apy", 800),
  chainHandler("hermetica-hbtc-adapter", "get-last-updated-block", 99_999),

  // Live protocol TVL (DefiLlama).
  tvlHandler("zest-v2", 83_000_000),
  tvlHandler("hermetica", 12_000_000),

  // Zest: DefiLlama per-pool chart, latest apy 3.4%.
  http.get(`https://yields.llama.fi/chart/${ZEST_POOL}`, () =>
    HttpResponse.json({ data: [{ timestamp: "t", apy: 3.4, tvlUsd: 53_000_000 }] })
  )
);

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe("fetchZest (sync lending)", () => {
  it("returns the zest protocol id", async () => {
    expect((await fetchZest()).protocol).toBe("zest");
  });
  it("maps apy from on-chain basis points", async () => {
    expect((await fetchZest()).apy_percent).toBe(3.4);
  });
  it("uses live DefiLlama protocol TVL", async () => {
    expect((await fetchZest()).tvl_usd).toBe(83_000_000);
  });
  it("is a live integration (Zest has a live APY source)", async () => {
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
});

describe("fetchHbtc (async strategy)", () => {
  it("returns the hbtc protocol id", async () => {
    expect((await fetchHbtc()).protocol).toBe("hbtc");
  });
  it("maps apy from on-chain basis points", async () => {
    expect((await fetchHbtc()).apy_percent).toBe(8);
  });
  it("is a reference rate (no live APY endpoint) -> is_live_integration false", async () => {
    expect((await fetchHbtc()).is_live_integration).toBe(false);
  });
  it("carries medium risk (managed strategy, not principal-guaranteed)", async () => {
    expect((await fetchHbtc()).risk_level).toBe("medium");
  });
});
