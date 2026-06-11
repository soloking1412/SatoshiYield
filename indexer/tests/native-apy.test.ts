import { describe, it, expect, beforeAll, afterEach, afterAll } from "vitest";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import {
  fetchZestNativeApy,
  fetchHbtcNativeApy,
  fetchNativeApys,
} from "../src/fetchers/native-apy.js";

const ZEST_POOL = "f003d6df-fb8f-4a74-8cfb-aee8cc44f433";

// One consistent mocked Zest apy across the file — defillama.ts caches the pool
// for 60s, so all reads within a run see the same value.
const server = setupServer(
  http.get(`https://yields.llama.fi/chart/${ZEST_POOL}`, () =>
    HttpResponse.json({ data: [{ apy: 3.4, tvlUsd: 53_000_000 }] })
  )
);
beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe("fetchZestNativeApy", () => {
  it("reads the latest Zest sBTC supply pool apy (percent)", async () => {
    server.use(
      http.get(`https://yields.llama.fi/chart/${ZEST_POOL}`, () =>
        HttpResponse.json({ data: [{ apy: 3.4, tvlUsd: 53_000_000 }] })
      )
    );
    expect(await fetchZestNativeApy()).toBeCloseTo(3.4, 2);
  });
});

describe("fetchHbtcNativeApy", () => {
  it("returns null — no public APY feed (the ~8% target is a reference rate)", async () => {
    expect(await fetchHbtcNativeApy()).toBeNull();
  });
});

describe("fetchNativeApys", () => {
  it("returns a live zest rate and a null (reference) hbtc rate", async () => {
    server.use(
      http.get(`https://yields.llama.fi/chart/${ZEST_POOL}`, () =>
        HttpResponse.json({ data: [{ apy: 3.4, tvlUsd: 53_000_000 }] })
      )
    );
    const r = await fetchNativeApys();
    expect(r.zest).toBeCloseTo(3.4, 2);
    expect(r.hbtc).toBeNull();
  });
});
