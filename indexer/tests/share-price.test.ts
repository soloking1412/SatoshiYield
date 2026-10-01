import { describe, it, expect } from "vitest";
import { computeRealizedApy } from "../src/share-price.js";

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const now = 1_700_000_000_000;

describe("computeRealizedApy (on-chain share-price growth)", () => {
  it("returns null with no history", () => {
    expect(computeRealizedApy([], 1.04, now)).toBeNull();
  });

  it("returns null when the only snapshot is younger than the 24h window", () => {
    expect(computeRealizedApy([{ t: now - 12 * HOUR, p: 1.0 }], 1.04, now)).toBeNull();
  });

  it("annualizes growth over a ~1-day window (~4% APY)", () => {
    const p0 = 1.0;
    const p1 = p0 * Math.pow(1.04, 1 / 365); // one day of 4%-APY growth
    const apy = computeRealizedApy([{ t: now - DAY, p: p0 }], p1, now);
    expect(apy).not.toBeNull();
    expect(apy!).toBeCloseTo(4.0, 1);
  });

  it("uses the OLDEST snapshot >= 24h old for the longest, smoothest window", () => {
    const p0 = 1.0;
    const p1 = p0 * Math.pow(1.05, 7 / 365); // 7 days of 5%-APY growth
    const snaps = [
      { t: now - 7 * DAY, p: p0 },
      { t: now - DAY, p: p0 * Math.pow(1.05, 6 / 365) },
    ];
    const apy = computeRealizedApy(snaps, p1, now);
    expect(apy).not.toBeNull();
    expect(apy!).toBeCloseTo(5.0, 0);
  });

  it("returns null on a price decrease/reset (treated as noise, not a negative APY)", () => {
    expect(computeRealizedApy([{ t: now - DAY, p: 1.04 }], 1.0, now)).toBeNull();
  });

  it("returns null for a non-positive current price", () => {
    expect(computeRealizedApy([{ t: now - DAY, p: 1.0 }], 0, now)).toBeNull();
  });
  it("rejects old, future and corrupt persisted timestamps", () => {
    for (const t of [now - 31 * DAY, now + DAY, NaN, Infinity, -Infinity]) {
      expect(computeRealizedApy([{ t, p: 1 }], 1.04, now)).toBeNull();
    }
  });
  it("returns a measured zero rather than a fabricated reference rate on no growth", () => {
    expect(computeRealizedApy([{ t: now - DAY, p: 1 }], 1, now)).toBe(0);
  });
});
