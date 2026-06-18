import { describe, it, expect } from "vitest";
import { formatApy, apyDecimals } from "../../src/lib/format.js";

describe("formatApy — honest low-rate display", () => {
  it("shows a tiny-but-real rate as itself, never a misleading 0.0", () => {
    // The live bug: Zest at 0.03% rendered as "0.0%" via toFixed(1).
    expect(formatApy(0.03)).toBe("0.03");
    expect(formatApy(0.17)).toBe("0.17");
    expect(formatApy(0.09)).toBe("0.09");
  });

  it("floors genuinely sub-0.01 rates to <0.01 instead of 0.00", () => {
    expect(formatApy(0.004)).toBe("<0.01");
    expect(formatApy(0.0001)).toBe("<0.01");
  });

  it("renders exact/invalid zero as 0", () => {
    expect(formatApy(0)).toBe("0");
    expect(formatApy(-1)).toBe("0");
    expect(formatApy(NaN)).toBe("0");
    expect(formatApy(Infinity)).toBe("0");
  });

  it("uses 2 decimals across the whole sub-1% range so nothing rounds away", () => {
    expect(formatApy(0.17)).toBe("0.17"); // would be "0.2" with a 1-decimal cut
    expect(formatApy(0.3)).toBe("0.30");
  });

  it("keeps normal rates at 1 decimal (no regression)", () => {
    expect(formatApy(3.4)).toBe("3.4");
    expect(formatApy(8)).toBe("8.0");
    expect(formatApy(12.34)).toBe("12.3");
  });

  it("drops decimals for very large rates", () => {
    expect(formatApy(120)).toBe("120");
    expect(formatApy(150.7)).toBe("151");
  });
});

describe("apyDecimals", () => {
  it("picks decimals by magnitude so small rates stay visible", () => {
    expect(apyDecimals(0.03)).toBe(2);
    expect(apyDecimals(0.09)).toBe(2);
    expect(apyDecimals(0.17)).toBe(2);
    expect(apyDecimals(0.99)).toBe(2);
    expect(apyDecimals(1)).toBe(1);
    expect(apyDecimals(3.4)).toBe(1);
    expect(apyDecimals(99.9)).toBe(1);
    expect(apyDecimals(100)).toBe(0);
  });
});
