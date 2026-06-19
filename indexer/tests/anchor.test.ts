import { describe, it, expect, beforeAll, afterEach, afterAll } from "vitest";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { serializeCV, responseOkCV, tupleCV, uintCV } from "@stacks/transactions";
import { readAnchorApyBps } from "../src/fetchers/chain.js";

// Must match vitest.config.ts env
const DEPLOYER = "SP000000000000000000002AMW42H";
const API = "https://api.hiro.so";
const ADAPTER = "zest-earn-adapter";

function apyUrl() {
  return `${API}/v2/contracts/call-read/${DEPLOYER}/${ADAPTER}/get-apy`;
}
function reportUrl() {
  return `${API}/v2/contracts/call-read/${DEPLOYER}/${ADAPTER}/get-oracle-report`;
}

function okUint(n: number): string {
  return "0x0701" + n.toString(16).padStart(32, "0");
}
/** err-stale-apy: (err u107) */
const STALE_ERR = "0x08010000000000000000000000000000006b";

/** Serialize (ok { bps, block }) like the adapter's get-oracle-report. */
function report(bps: number, block: number): string {
  return "0x" + serializeCV(responseOkCV(tupleCV({ bps: uintCV(bps), block: uintCV(block) })));
}

const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe("readAnchorApyBps (stale-tolerant APY anchor)", () => {
  it("returns the live get-apy value when NOT stale (fresh path)", async () => {
    server.use(http.post(apyUrl(), () => HttpResponse.json({ okay: true, result: okUint(340) })));
    expect(await readAnchorApyBps(ADAPTER)).toBe(340);
  });

  it("reconstructs the committed anchor from oracle reports when STALE", async () => {
    // get-apy errors (stale); two oracles agree on 3, third never reported.
    server.use(
      http.post(apyUrl(), () => HttpResponse.json({ okay: true, result: STALE_ERR })),
      http.post(reportUrl(), async ({ request }) => {
        const body = (await request.json()) as { arguments: string[] };
        const idx0 = "0x" + serializeCV(uintCV(0));
        const idx1 = "0x" + serializeCV(uintCV(1));
        const arg = body.arguments[0];
        if (arg === idx0) return HttpResponse.json({ okay: true, result: report(3, 8331874) });
        if (arg === idx1) return HttpResponse.json({ okay: true, result: report(3, 8331655) });
        return HttpResponse.json({ okay: true, result: report(0, 0) }); // idx2 never reported
      })
    );
    // This is the exact production scenario that was trapping APY stale forever.
    expect(await readAnchorApyBps(ADAPTER)).toBe(3);
  });

  it("averages a consensus pair within tolerance", async () => {
    server.use(
      http.post(apyUrl(), () => HttpResponse.json({ okay: true, result: STALE_ERR })),
      http.post(reportUrl(), async ({ request }) => {
        const body = (await request.json()) as { arguments: string[] };
        const idx0 = "0x" + serializeCV(uintCV(0));
        const idx1 = "0x" + serializeCV(uintCV(1));
        const arg = body.arguments[0];
        // 100 and 105 are within 10% -> committed = floor((100+105)/2) = 102
        if (arg === idx0) return HttpResponse.json({ okay: true, result: report(100, 900) });
        if (arg === idx1) return HttpResponse.json({ okay: true, result: report(105, 901) });
        return HttpResponse.json({ okay: true, result: report(0, 0) });
      })
    );
    expect(await readAnchorApyBps(ADAPTER)).toBe(102);
  });

  it("returns null when stale and no oracle has ever reported (true bootstrap)", async () => {
    server.use(
      http.post(apyUrl(), () => HttpResponse.json({ okay: true, result: STALE_ERR })),
      http.post(reportUrl(), () => HttpResponse.json({ okay: true, result: report(0, 0) }))
    );
    expect(await readAnchorApyBps(ADAPTER)).toBeNull();
  });
});
