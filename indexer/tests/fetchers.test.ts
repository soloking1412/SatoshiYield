import { describe, it, expect, beforeAll, afterEach, afterAll } from "vitest";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { fetchBitflow } from "../src/fetchers/bitflow.js";
import { fetchAlex } from "../src/fetchers/alex.js";
import { fetchZest } from "../src/fetchers/zest.js";
import { fetchVelar } from "../src/fetchers/velar.js";

// Test-only fake principal. Must match process.env.DEPLOYER_ADDRESS in the
// test setup; chain.ts has no defaults, so the env must be populated before
// chain.ts is imported.
const DEPLOYER = "SP000000000000000000002AMW42H";
const API = "https://api.hiro.so";
const BTC_PRICE = 75_000;

/** Encode an unsigned integer as a Clarity (ok uint) hex response. */
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

const server = setupServer(
  // CoinGecko BTC price
  http.get("https://api.coingecko.com/api/v3/simple/price", () =>
    HttpResponse.json({ bitcoin: { usd: BTC_PRICE } })
  ),

  // Bitflow: 12.5% APY (1250 bps), 0.5 BTC deposited
  chainHandler("bitflow-adapter-v4", "get-apy", 1250),
  chainHandler("bitflow-adapter-v4", "get-last-updated-block", 99_999),
  chainHandler("bitflow-adapter-v4", "get-total-deposited", 50_000_000),

  // Alex: 10% APY (1000 bps), 10 BTC deposited -> TVL $750,000
  chainHandler("alex-adapter-v4", "get-apy", 1000),
  chainHandler("alex-adapter-v4", "get-last-updated-block", 99_999),
  chainHandler("alex-adapter-v4", "get-total-deposited", 1_000_000_000),

  // Zest: 8.5% APY (850 bps), 2 BTC deposited
  chainHandler("zest-adapter-v4", "get-apy", 850),
  chainHandler("zest-adapter-v4", "get-last-updated-block", 99_999),
  chainHandler("zest-adapter-v4", "get-total-deposited", 200_000_000),

  // Velar: 20% APY (2000 bps), 0.3 BTC deposited
  chainHandler("velar-adapter-v4", "get-apy", 2000),
  chainHandler("velar-adapter-v4", "get-last-updated-block", 99_999),
  chainHandler("velar-adapter-v4", "get-total-deposited", 30_000_000),

  // Native APY endpoints — return 404 to fall through to chain-only path.
  http.get("https://app.bitflow.finance/api/yield/sbtc", () =>
    HttpResponse.json({}, { status: 404 })
  ),
  http.get("https://api.alexgo.io/v1/stats/pool-info/sbtc-stx", () =>
    HttpResponse.json({}, { status: 404 })
  ),
  http.get("https://api.zestprotocol.com/v1/markets/sbtc", () =>
    HttpResponse.json({}, { status: 404 })
  ),
  http.get("https://api.velar.com/v1/pools/sbtc", () =>
    HttpResponse.json({}, { status: 404 })
  )
);

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe("fetchBitflow", () => {
  it("returns normalized yield with correct protocol id", async () => {
    const result = await fetchBitflow();
    expect(result.protocol).toBe("bitflow");
  });

  it("maps apy correctly from basis points", async () => {
    const result = await fetchBitflow();
    expect(result.apy_percent).toBe(12.5);
  });

  it("sets risk_level to medium", async () => {
    const result = await fetchBitflow();
    expect(result.risk_level).toBe("medium");
  });

  it("includes a fetched_at timestamp", async () => {
    const before = Date.now();
    const result = await fetchBitflow();
    expect(result.fetched_at).toBeGreaterThanOrEqual(before);
  });

  it("marks apy as stale (no throw) when the chain returns a non-200 response", async () => {
    server.use(
      http.post(chainUrl("bitflow-adapter-v4", "get-apy"), () =>
        HttpResponse.json({ error: "not found" }, { status: 404 })
      )
    );
    const result = await fetchBitflow();
    expect(result.apy_stale).toBe(true);
    expect(result.apy_percent).toBe(0);
  });

  it("marks apy as stale (no throw) when chain response has unexpected shape", async () => {
    server.use(
      http.post(chainUrl("bitflow-adapter-v4", "get-apy"), () =>
        HttpResponse.json({ unexpected: true })
      )
    );
    const result = await fetchBitflow();
    expect(result.apy_stale).toBe(true);
  });
});

describe("fetchAlex", () => {
  it("returns normalized yield with correct protocol id", async () => {
    const result = await fetchAlex();
    expect(result.protocol).toBe("alex");
  });

  it("maps tvl correctly using BTC price", async () => {
    const result = await fetchAlex();
    // 1_000_000_000 sats = 10 BTC at $75,000 = $750,000
    expect(result.tvl_usd).toBe(750_000);
  });
});

describe("fetchZest", () => {
  it("returns normalized yield with risk_level low", async () => {
    const result = await fetchZest();
    expect(result.protocol).toBe("zest");
    expect(result.risk_level).toBe("low");
  });

  it("maps apy correctly from basis points", async () => {
    const result = await fetchZest();
    expect(result.apy_percent).toBe(8.5);
  });
});

describe("fetchVelar", () => {
  it("returns normalized yield with risk_level high", async () => {
    const result = await fetchVelar();
    expect(result.protocol).toBe("velar");
    expect(result.risk_level).toBe("high");
  });

  it("maps apy correctly from basis points", async () => {
    const result = await fetchVelar();
    expect(result.apy_percent).toBe(20.0);
  });
});
