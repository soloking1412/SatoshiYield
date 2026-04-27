import { describe, it, expect, beforeAll, afterEach, afterAll } from "vitest";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { aggregateYields, invalidateCache } from "../src/aggregator.js";

const DEPLOYER = "ST1JXS4BTWDNNEX28QS8ABHQSCAD4BQMAN11TP6B1";
const API = "https://api.testnet.hiro.so";
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

const ADAPTERS = ["bitflow-adapter", "alex-adapter", "zest-adapter", "velar-adapter"];

const server = setupServer(
  http.get("https://api.coingecko.com/api/v3/simple/price", () =>
    HttpResponse.json({ bitcoin: { usd: BTC_PRICE } })
  ),

  chainHandler("bitflow-adapter", "get-apy", 1250),
  chainHandler("bitflow-adapter", "get-total-deposited", 50_000_000),

  chainHandler("alex-adapter", "get-apy", 1000),
  chainHandler("alex-adapter", "get-total-deposited", 1_000_000_000),

  chainHandler("zest-adapter", "get-apy", 850),
  chainHandler("zest-adapter", "get-total-deposited", 200_000_000),

  chainHandler("velar-adapter", "get-apy", 2000),
  chainHandler("velar-adapter", "get-total-deposited", 30_000_000)
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

  it("still returns the other three protocols when one fetcher fails", async () => {
    server.use(
      http.post(chainUrl("bitflow-adapter", "get-apy"), () =>
        HttpResponse.json({ error: "down" }, { status: 500 })
      )
    );
    const yields = await aggregateYields();
    expect(yields).toHaveLength(3);
    expect(yields.map((y) => y.protocol)).not.toContain("bitflow");
  });

  it("returns an empty array when all fetchers fail", async () => {
    server.use(
      ...ADAPTERS.flatMap((adapter) => [
        http.post(chainUrl(adapter, "get-apy"), () => HttpResponse.error()),
        http.post(chainUrl(adapter, "get-total-deposited"), () =>
          HttpResponse.error()
        ),
      ])
    );
    const yields = await aggregateYields();
    expect(yields).toHaveLength(0);
  });

  it("returns cached data on the second call without re-fetching", async () => {
    await aggregateYields();

    // Override bitflow to fail — should not matter because cache is hit
    server.use(
      http.post(chainUrl("bitflow-adapter", "get-apy"), () =>
        HttpResponse.json({ error: "should not be called" }, { status: 500 })
      )
    );

    const second = await aggregateYields();
    expect(second).toHaveLength(4);
  });
});
