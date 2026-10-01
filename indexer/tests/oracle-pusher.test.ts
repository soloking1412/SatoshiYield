import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("../src/fetchers/chain.js", () => ({
  readAnchorApyBps: vi.fn(),
  exceedsDeviation: (value: number, anchor: number, max: number) =>
    anchor > 0 && Math.abs(value - anchor) / anchor * 100 > max,
}));
vi.mock("../src/fetchers/native-apy.js", () => ({ fetchZestNativeApy: vi.fn() }));
import { readAnchorApyBps } from "../src/fetchers/chain.js";
import { fetchZestNativeApy } from "../src/fetchers/native-apy.js";
import { buildBpsMap, pushApy } from "../src/oracle-pusher.js";

beforeEach(() => vi.clearAllMocks());
describe("oracle publication safety", () => {
  it.each([null, NaN, Infinity, -1, 61])("does not refresh stale observations with invalid native APY %s", async (native) => {
    vi.mocked(fetchZestNativeApy).mockResolvedValue(native);
    vi.mocked(readAnchorApyBps).mockResolvedValue(350);
    expect(await buildBpsMap()).toEqual({});
  });
  it("does not bootstrap a reference rate when both reads fail", async () => {
    vi.mocked(fetchZestNativeApy).mockRejectedValue(new Error("outage"));
    vi.mocked(readAnchorApyBps).mockRejectedValue(new Error("outage"));
    expect(await buildBpsMap()).toEqual({});
  });
  it("requires an observed committed anchor even when the feed is healthy", async () => {
    vi.mocked(fetchZestNativeApy).mockResolvedValue(4);
    vi.mocked(readAnchorApyBps).mockResolvedValue(null);
    expect(await buildBpsMap()).toEqual({});
  });
  it("supports verified zero APY observations without fabricating yield", async () => {
    vi.mocked(fetchZestNativeApy).mockResolvedValue(0);
    vi.mocked(readAnchorApyBps).mockResolvedValue(0);
    expect(await buildBpsMap()).toEqual({ "zest-earn-adapter": 0 });
  });
  it("does not synthesize intermediate rates to walk around the deviation guard", async () => {
    vi.mocked(fetchZestNativeApy).mockResolvedValue(5);
    vi.mocked(readAnchorApyBps).mockResolvedValue(100);
    expect(await buildBpsMap()).toEqual({});
  });
  it("publishes the measured rate when it satisfies the deviation bound", async () => {
    vi.mocked(fetchZestNativeApy).mockResolvedValue(1.4);
    vi.mocked(readAnchorApyBps).mockResolvedValue(100);
    expect(await buildBpsMap()).toEqual({ "zest-earn-adapter": 140 });
  });
  it("cannot sign or broadcast unless writes are explicitly enabled", async () => {
    expect(await pushApy("zest-earn-adapter", 100)).toMatchObject({ pushed: false, reason: "writes_disabled" });
  });
});
