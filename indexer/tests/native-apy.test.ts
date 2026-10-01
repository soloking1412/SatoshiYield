import { describe, it, expect, beforeAll, afterEach, afterAll } from "vitest";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import {
  fetchZestNativeApy,
  fetchHbtcNativeApy,
} from "../src/fetchers/native-apy.js";
import { __setHistory } from "../src/share-price.js";

const API = "https://api.hiro.so";
const ZEST_ADDR = "SP1A27KFY4XERQCCRCARCYD1CC5N7M6688BSYADJ7";
const SHARE_UNIT = 100_000_000;

// convert-to-assets returns a BARE Clarity uint (type byte 01) + 16-byte BE value.
function uintHex(n: bigint): string {
  return "0x01" + n.toString(16).padStart(32, "0");
}
function convertToAssets(price: number) {
  const assets = BigInt(Math.round(price * SHARE_UNIT));
  return http.post(
    `${API}/v2/contracts/call-read/${ZEST_ADDR}/v0-vault-sbtc/convert-to-assets`,
    () => HttpResponse.json({ okay: true, result: uintHex(assets) })
  );
}

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => {
  server.resetHandlers();
  __setHistory([]); // reset rolling history between tests
});
afterAll(() => server.close());

describe("fetchZestNativeApy (on-chain share-price growth)", () => {
  it("returns null until >= 24h of history exists", async () => {
    server.use(convertToAssets(1.04));
    expect(await fetchZestNativeApy()).toBeNull();
  });

  it("derives a realized APY once a >= 24h-old snapshot exists", async () => {
    const p0 = 1.0;
    __setHistory([{ t: Date.now() - 7 * 24 * 60 * 60 * 1000, p: p0 }]);
    const p1 = p0 * Math.pow(1.05, 7 / 365); // 7 days of 5%-APY growth
    server.use(convertToAssets(p1));
    const apy = await fetchZestNativeApy();
    expect(apy).not.toBeNull();
    expect(apy!).toBeCloseTo(5.0, 0);
  });

  it("returns null when the chain read fails", async () => {
    __setHistory([{ t: Date.now() - 2 * 24 * 60 * 60 * 1000, p: 1.0 }]);
    server.use(
      http.post(
        `${API}/v2/contracts/call-read/${ZEST_ADDR}/v0-vault-sbtc/convert-to-assets`,
        () => HttpResponse.json({ okay: false, result: "0x08000000000000000000000000000000007b" })
      )
    );
    expect(await fetchZestNativeApy()).toBeNull();
  });
  it("rejects an anomalous rate above the cap instead of clamping it into valid-looking data", async () => {
    __setHistory([{ t: Date.now() - 2 * 24 * 60 * 60 * 1000, p: 1.0 }]);
    server.use(convertToAssets(2));
    expect(await fetchZestNativeApy()).toBeNull();
  });
});

describe("fetchHbtcNativeApy", () => {
  it("returns null — no public APY feed (the ~8% target is a reference rate)", async () => {
    expect(await fetchHbtcNativeApy()).toBeNull();
  });
});
