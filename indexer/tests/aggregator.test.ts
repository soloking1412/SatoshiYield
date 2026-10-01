import { describe, it, expect, beforeAll, afterEach, afterAll } from "vitest";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { aggregateYields, invalidateCache } from "../src/aggregator.js";

const DEPLOYER = "SP000000000000000000002Q6VF78";
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
  invalidateCache();
});
afterAll(() => server.close());

describe("aggregateYields", () => {
  it("returns zest protocol when fetcher succeeds", async () => {
    const yields = await aggregateYields();
    expect(yields).toHaveLength(1);
    expect(yields[0]!.protocol).toBe("zest");
  });

  it("returns results sorted by apy_percent descending", async () => {
    const yields = await aggregateYields();
    for (let i = 0; i < yields.length - 1; i++) {
      expect(yields[i]!.apy_percent).toBeGreaterThanOrEqual(yields[i + 1]!.apy_percent);
    }
  });

  it("still returns a failing protocol as stale (degraded, not omitted)", async () => {
    server.use(
      http.post(chainUrl("zest-earn-adapter", "get-apy"), () =>
        HttpResponse.json({ error: "down" }, { status: 500 })
      )
    );
    const yields = await aggregateYields();
    expect(yields).toHaveLength(1);
    expect(yields.find((y) => y.protocol === "zest")?.apy_stale).toBe(true);
  });

  it("returns stale entries when all chain reads fail", async () => {
    server.use(
      http.post(chainUrl("zest-earn-adapter", "get-apy"), () => HttpResponse.error()),
      http.post(chainUrl("zest-earn-adapter", "get-last-updated-block"), () => HttpResponse.error())
    );
    const yields = await aggregateYields();
    expect(yields).toHaveLength(1);
    for (const y of yields) {
      expect(y.apy_stale).toBe(true);
      expect(y.apy_percent).toBe(0);
    }
  });

  it("returns cached data on the second call without re-fetching", async () => {
    await aggregateYields();
    server.use(
      http.post(chainUrl("zest-earn-adapter", "get-apy"), () =>
        HttpResponse.json({ error: "should not be called" }, { status: 500 })
      )
    );
    const second = await aggregateYields();
    expect(second).toHaveLength(1);
  });
});
