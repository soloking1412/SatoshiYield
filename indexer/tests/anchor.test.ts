import { describe, it, expect, beforeAll, afterEach, afterAll } from "vitest";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { readAnchorApyBps } from "../src/fetchers/chain.js";

const BASE = "https://api.hiro.so";
const ADDRESS = "SP000000000000000000002Q6VF78";
const ADAPTER = "zest-earn-adapter";
const apyUrl = `${BASE}/v2/contracts/call-read/${ADDRESS}/${ADAPTER}/get-apy`;
const stateUrl = `${BASE}/v2/data_var/${ADDRESS}/${ADAPTER}/current-apy-bps`;
const uint = (n: number) => "01" + n.toString(16).padStart(32, "0");
const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe("readAnchorApyBps", () => {
  it("uses an available get-apy response", async () => {
    server.use(http.post(apyUrl, () => HttpResponse.json({ okay: true, result: `0x07${uint(340)}` })));
    expect(await readAnchorApyBps(ADAPTER)).toBe(340);
  });
  it("reads actual committed state when get-apy is stale, never reconstructing proposals", async () => {
    server.use(
      http.post(apyUrl, () => HttpResponse.json({ okay: true, result: `0x08${uint(107)}` })),
      http.get(stateUrl, () => HttpResponse.json({ data: `0x${uint(3)}` }))
    );
    expect(await readAnchorApyBps(ADAPTER)).toBe(3);
  });
  it("accepts a verified zero anchor for bootstrapping from a real feed", async () => {
    server.use(
      http.post(apyUrl, () => HttpResponse.json({ okay: false })),
      http.get(stateUrl, () => HttpResponse.json({ data: `0x${uint(0)}` }))
    );
    expect(await readAnchorApyBps(ADAPTER)).toBe(0);
  });
  it.each([`0x${uint(6001)}`, "0x0101", `0x00${"0".repeat(32)}`, `0x${uint(3)}00`])(
    "fails closed on malformed or out-of-range committed data: %s", async (data) => {
      server.use(
        http.post(apyUrl, () => HttpResponse.json({ okay: false })),
        http.get(stateUrl, () => HttpResponse.json({ data }))
      );
      expect(await readAnchorApyBps(ADAPTER)).toBeNull();
    }
  );
  it("returns unknown if the node fails; never guesses a reference APY", async () => {
    server.use(
      http.post(apyUrl, () => HttpResponse.error()),
      http.get(stateUrl, () => HttpResponse.error())
    );
    expect(await readAnchorApyBps(ADAPTER)).toBeNull();
  });
});
