import { describe, it, expect } from "vitest";
import { evaluateOracleHealth } from "../src/oracle-health.js";
import type { OracleGas, PushResult } from "../src/oracle-pusher.js";

const pushed = (adapter: string): PushResult => ({ adapter, pushed: true, txid: "0xabc" });
const failed = (adapter: string, reason: string): PushResult => ({ adapter, pushed: false, reason });

const gas = (ustx: number, runwayCycles: number, lowGas: boolean): OracleGas => ({
  address: "SP13V84J95XQYKQV2T9MXQ27Y345C2BEP13FM5MS6",
  ustx,
  runwayCycles,
  lowGas,
});

describe("evaluateOracleHealth", () => {
  it("is healthy when dual-mode, fresh, all pushes landed, and gas is ample", () => {
    const h = evaluateOracleHealth({
      mode: "dual",
      ageSeconds: 60,
      lastResults: [pushed("zest-earn-adapter")],
      lastGas: [gas(5_000_000, 1666, false), gas(5_000_000, 1666, false)],
    });
    expect(h.degraded).toBe(false);
    expect(h.pushFailing).toBe(false);
    expect(h.lowGas).toBe(false);
  });

  it("flags degraded when the last cycle pushed 0 of 1 (the out-of-gas incident)", () => {
    // The exact live failure: cycle ran recently (not stalled) but the push was
    // rejected because the wallet was out of STX — health MUST NOT read healthy.
    const h = evaluateOracleHealth({
      mode: "dual",
      ageSeconds: 1531,
      lastResults: [failed("zest-earn-adapter", "NotEnoughFunds")],
      lastGas: [gas(358, 0, true)],
    });
    expect(h.pushFailing).toBe(true);
    expect(h.lowGas).toBe(true);
    expect(h.degraded).toBe(true);
    expect(h.pushed).toBe(0);
    expect(h.total).toBe(1);
  });

  it("flags degraded on low gas alone, BEFORE any push starts failing", () => {
    // Early warning: pushes still landing, but a wallet is nearly drained.
    const h = evaluateOracleHealth({
      mode: "dual",
      ageSeconds: 60,
      lastResults: [pushed("zest-earn-adapter")],
      lastGas: [gas(5_000_000, 1666, false), gas(120_000, 40, true)],
    });
    expect(h.pushFailing).toBe(false);
    expect(h.lowGas).toBe(true);
    expect(h.degraded).toBe(true);
  });

  it("flags degraded when the push cycle has stalled (> 70 min)", () => {
    const h = evaluateOracleHealth({
      mode: "dual",
      ageSeconds: 71 * 60,
      lastResults: [pushed("zest-earn-adapter")],
      lastGas: [gas(5_000_000, 1666, false)],
    });
    expect(h.cycleStalled).toBe(true);
    expect(h.degraded).toBe(true);
  });

  it("flags degraded before the first cycle (no data yet)", () => {
    const h = evaluateOracleHealth({
      mode: "dual",
      ageSeconds: null,
      lastResults: [],
      lastGas: [],
    });
    expect(h.cycleStalled).toBe(true);
    expect(h.pushFailing).toBe(false); // no attempts yet, not a push failure
    expect(h.degraded).toBe(true);
  });

  it("flags degraded in single-oracle mode even when everything else is fine", () => {
    const h = evaluateOracleHealth({
      mode: "single",
      ageSeconds: 60,
      lastResults: [pushed("zest-earn-adapter")],
      lastGas: [gas(5_000_000, 1666, false)],
    });
    expect(h.degraded).toBe(true);
  });
});
