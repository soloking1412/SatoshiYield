import { beforeEach, describe, expect, it, vi } from "vitest";
import { Cl } from "@stacks/transactions";
const state = vi.hoisted(() => ({ read: vi.fn(), enabled: true }));
const address = "ST1RHTNPSR0SX6SZC4ZGCPH5W8XS0MRT25NW98QDX";
vi.mock("../../src/constants/contracts.js", () => ({
  get DEPOSITS_ENABLED() { return state.enabled; }, DEPOSIT_BLOCK_REASON: "Disabled",
  CONTRACTS: { VAULT: "ST1RHTNPSR0SX6SZC4ZGCPH5W8XS0MRT25NW98QDX.vault-v7", SBTC_TOKEN: "ST1RHTNPSR0SX6SZC4ZGCPH5W8XS0MRT25NW98QDX.mock-sbtc", ADAPTERS: { zest: "ST1RHTNPSR0SX6SZC4ZGCPH5W8XS0MRT25NW98QDX.mock-sync-v7", hbtc: "ST1RHTNPSR0SX6SZC4ZGCPH5W8XS0MRT25NW98QDX.mock-async-v7" } },
}));
vi.mock("../../src/lib/chainRead.js", async original => ({ ...await original<object>(), readContract: state.read }));
import { fetchDepositAdmission } from "../../src/lib/depositAdmission.js";
const config = (enabled = true, async = false) => Cl.some(Cl.tuple({ enabled: Cl.bool(enabled), "is-async": Cl.bool(async), cap: Cl.uint(100000) }));
function replies(overrides: Record<string, ReturnType<typeof Cl.uint> | ReturnType<typeof Cl.bool> | ReturnType<typeof config> | ReturnType<typeof Cl.none>> = {}) {
  state.read.mockImplementation(async (_contract: string, fn: string) => {
    const result = { "is-global-paused": Cl.bool(false), "get-sbtc-token": Cl.some(Cl.contractPrincipal(address, "mock-sbtc")), "get-adapter-config": config(), "get-adapter-deposited": Cl.uint(1200), "is-paused": Cl.bool(false), "get-apy": Cl.uint(0), ...overrides }[fn];
    if (!result) throw new Error(`Unexpected read ${fn}`);
    return result;
  });
}
beforeEach(() => { vi.clearAllMocks(); state.enabled = true; replies(); });
describe("live deposit admission", () => {
  it("uses integer adapter capacity and accepts a valid zero APY", async () => expect(await fetchDepositAdmission("zest")).toEqual({ available: true, reason: "", remainingSats: 98800n }));
  it("blocks disabled environments without network access", async () => { state.enabled = false; expect((await fetchDepositAdmission("zest")).available).toBe(false); expect(state.read).not.toHaveBeenCalled(); });
  it.each([
    { "is-global-paused": Cl.bool(true) },
    { "get-adapter-config": Cl.none() },
    { "get-adapter-config": config(false) },
    { "get-adapter-deposited": Cl.uint(100000) },
    { "is-paused": Cl.bool(true) },
  ])("blocks unavailable admission case %#", async patch => { replies(patch); expect((await fetchDepositAdmission("zest")).available).toBe(false); });
  it("rejects wrong asset and withdrawal type", async () => {
    replies({ "get-sbtc-token": Cl.none() }); await expect(fetchDepositAdmission("zest")).rejects.toThrow("asset binding");
    replies({ "get-adapter-config": config(true, true) }); await expect(fetchDepositAdmission("zest")).rejects.toThrow("withdrawal type");
  });
  it("fails closed on stale oracle/RPC errors", async () => { state.read.mockRejectedValue(new Error("Contract read returned an error")); await expect(fetchDepositAdmission("zest")).rejects.toThrow(); });
});
