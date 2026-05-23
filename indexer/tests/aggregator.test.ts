import { describe, it, expect, beforeAll, afterEach, afterAll } from "vitest";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { aggregateYields, invalidateCache } from "../src/aggregator.js";

// Test-only fake principal. Must match what process.env.DEPLOYER_ADDRESS is
// set to in the test runner (see vitest.config / setup).
const DEPLOYER = "SP000000000000000000002AMW42H";
const API = "https://api.hiro.so";
const BTC_PRICE = 75_000;

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

const ADAPTERS = ["bitflow-adapter-v4", "alex-adapter-v4", "zest-adapter-v4", "velar-adapter-v4"];

const server = setupServer(
  http.get("https://api.coingecko.com/api/v3/simple/price", () =>
    HttpResponse.json({ bitcoin: { usd: BTC_PRICE } })
  ),

  chainHandler("bitflow-adapter-v4", "get-apy", 1250),
  chainHandler("bitflow-adapter-v4", "get-last-updated-block", 99_999),
  chainHandler("bitflow-adapter-v4", "get-total-deposited", 50_000_000),

  chainHandler("alex-adapter-v4", "get-apy", 1000),
  chainHandler("alex-adapter-v4", "get-last-updated-block", 99_999),
  chainHandler("alex-adapter-v4", "get-total-deposited", 1_000_000_000),

  chainHandler("zest-adapter-v4", "get-apy", 850),
  chainHandler("zest-adapter-v4", "get-last-updated-block", 99_999),
  chainHandler("zest-adapter-v4", "get-total-deposited", 200_000_000),

  chainHandler("velar-adapter-v4", "get-apy", 2000),
  chainHandler("velar-adapter-v4", "get-last-updated-block", 99_999),
  chainHandler("velar-adapter-v4", "get-total-deposited", 30_000_000),

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
afterEach(() => {
  server.resetHandlers();
  invalidateCache();
});
afterAll(() => server.close());

describe("aggregateYields", () => {
  it("returns all four protocols when all fetchers succeed", async () => {
    const yields = await aggregateYields();
    expect(yields).toHaveLength(4);
    const ids = yields.map((y) => y.protocol);
    expect(ids).toContain("bitflow");
    expect(ids).toContain("alex");
    expect(ids).toContain("zest");
    expect(ids).toContain("velar");
  });

  it("returns results sorted by apy_percent descending", async () => {
    const yields = await aggregateYields();
    for (let i = 0; i < yields.length - 1; i++) {
      expect(yields[i]!.apy_percent).toBeGreaterThanOrEqual(yields[i + 1]!.apy_percent);
    }
  });

  it("still returns the failing protocol as stale (degraded, not omitted)", async () => {
    server.use(
      http.post(chainUrl("bitflow-adapter-v4", "get-apy"), () =>
        HttpResponse.json({ error: "down" }, { status: 500 })
      )
    );
    const yields = await aggregateYields();
    // Production behaviour: degraded fetchers return an entry with apy_stale=true
    // rather than disappearing from the response — the UI surfaces the stale
    // state to users instead of hiding the protocol entirely.
    expect(yields).toHaveLength(4);
    const bitflow = yields.find((y) => y.protocol === "bitflow");
    expect(bitflow?.apy_stale).toBe(true);
  });

  it("returns four stale entries when all fetchers fail", async () => {
    server.use(
      ...ADAPTERS.flatMap((adapter) => [
        http.post(chainUrl(adapter, "get-apy"), () => HttpResponse.error()),
        http.post(chainUrl(adapter, "get-last-updated-block"), () =>
          HttpResponse.error()
        ),
        http.post(chainUrl(adapter, "get-total-deposited"), () =>
          HttpResponse.error()
        ),
      ])
    );
    const yields = await aggregateYields();
    expect(yields).toHaveLength(4);
    for (const y of yields) {
      expect(y.apy_stale).toBe(true);
      expect(y.apy_percent).toBe(0);
    }
  });

  it("returns cached data on the second call without re-fetching", async () => {
    await aggregateYields();

    // Override bitflow to fail — should not matter because cache is hit
    server.use(
      http.post(chainUrl("bitflow-adapter-v4", "get-apy"), () =>
        HttpResponse.json({ error: "should not be called" }, { status: 500 })
      )
    );

    const second = await aggregateYields();
    expect(second).toHaveLength(4);
  });
});
