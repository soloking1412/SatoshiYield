import { describe, it, expect, beforeEach } from "vitest";
import { Cl, cvToValue } from "@stacks/transactions";
import { initSimnet } from "@hirosystems/clarinet-sdk";

/**
 * Full-stack REVENUE test: vault-v6 -> zest-earn-adapter (SYNC) -> shim (v0-vault-sbtc).
 * Proves the principal-protected real-yield path end to end:
 *   - deposit routes sBTC into the Zest vault and mints shares
 *   - simulated Zest yield accrues to the share price
 *   - withdraw redeems shares for principal + yield
 *   - vault-v6 returns principal + 95% of yield to the user and books 5% as fee
 *   - principal is protected when yield is zero
 */

const simnet = await initSimnet();
const accounts = simnet.getAccounts();
const deployer = accounts.get("deployer")!;
const wallet1 = accounts.get("wallet_1")!;
const oracle1 = accounts.get("wallet_3")!;
const oracle2 = accounts.get("wallet_4")!;

const MINT = 100_000_000n;       // 1 sBTC
const DEPOSIT = 10_000_000n;     // 0.1 sBTC
const ADAPTER = "zest-earn-adapter";

const ZEST_SHIM = "SP1A27KFY4XERQCCRCARCYD1CC5N7M6688BSYADJ7.v0-vault-sbtc";

const SBTC = Cl.contractPrincipal(deployer, "mock-sbtc");
const adapterCV = Cl.contractPrincipal(deployer, ADAPTER);

function setup() {
  simnet.callPublicFn("mock-sbtc", "mint", [Cl.uint(MINT), Cl.principal(wallet1)], deployer);
  simnet.callPublicFn("vault-v6", "set-sbtc-token", [SBTC], deployer);
  simnet.callPublicFn("vault-v6", "approve-adapter", [adapterCV, Cl.bool(false)], deployer); // sync
  simnet.callPublicFn(ADAPTER, "set-vault", [Cl.contractPrincipal(deployer, "vault-v6")], deployer);
  simnet.callPublicFn(ADAPTER, "set-oracle-at", [Cl.uint(0), Cl.principal(oracle1)], deployer);
  simnet.callPublicFn(ADAPTER, "set-oracle-at", [Cl.uint(1), Cl.principal(oracle2)], deployer);
  simnet.callPublicFn(ADAPTER, "set-apy", [Cl.uint(400)], oracle1);
  simnet.callPublicFn(ADAPTER, "set-apy", [Cl.uint(400)], oracle2);
}

const deposit = (amount: bigint, sender: string) =>
  simnet.callPublicFn("vault-v6", "deposit", [SBTC, adapterCV, Cl.uint(amount)], sender);
const withdraw = (sender: string) =>
  simnet.callPublicFn("vault-v6", "withdraw", [SBTC, adapterCV], sender);
const adminExit = (user: string, sender: string) =>
  simnet.callPublicFn("vault-v6", "admin-exit", [Cl.principal(user), adapterCV, SBTC], sender);
const addYield = (amount: bigint) => {
  simnet.callPublicFn(ZEST_SHIM, "add-yield", [Cl.uint(amount)], deployer);
  simnet.callPublicFn("mock-sbtc", "mint",
    [Cl.uint(amount), Cl.contractPrincipal(deployer, ADAPTER)], deployer);
};

function sbtcBalance(who: string): bigint {
  const r = simnet.callReadOnlyFn("mock-sbtc", "get-balance", [Cl.principal(who)], deployer);
  return BigInt(cvToValue(r.result).value);
}
beforeEach(setup);

describe("zest-earn-adapter (sync) — routes funds into Zest", () => {
  it("deposit moves sBTC out of the user and into the Zest vault", () => {
    const before = sbtcBalance(wallet1);
    expect(deposit(DEPOSIT, wallet1).result).toBeOk(Cl.uint(DEPOSIT));
    expect(sbtcBalance(wallet1)).toBe(before - DEPOSIT);
    const vaultAssets = simnet.callReadOnlyFn(ZEST_SHIM, "get-total-assets", [], deployer);
    expect(cvToValue(vaultAssets.result)).toBe(DEPOSIT);
    const shares = simnet.callReadOnlyFn(ADAPTER, "get-shares", [Cl.principal(wallet1)], deployer);
    expect(BigInt(cvToValue(shares.result))).toBe(DEPOSIT);
  });

  it("PRINCIPAL PROTECTED: withdraw with zero yield returns exactly the principal", () => {
    const before = sbtcBalance(wallet1);
    deposit(DEPOSIT, wallet1);
    expect(withdraw(wallet1).result).toBeOk(Cl.uint(DEPOSIT));
    expect(sbtcBalance(wallet1)).toBe(before);
    expect(simnet.callReadOnlyFn("vault-v6", "get-fee-balance", [], deployer).result).toBeUint(0n);
  });
});

describe("zest-earn-adapter (sync) — REVENUE: yield + performance fee", () => {
  it("withdraw returns principal + 95% of yield; vault books 5% fee", () => {
    const before = sbtcBalance(wallet1);
    deposit(DEPOSIT, wallet1);
    const YIELD = 1_000_000n;
    addYield(YIELD);
    const fee = YIELD * 500n / 10000n;
    const expectedPayout = DEPOSIT + (YIELD - fee);
    expect(withdraw(wallet1).result).toBeOk(Cl.uint(expectedPayout));
    expect(sbtcBalance(wallet1)).toBe(before + (YIELD - fee));
    expect(simnet.callReadOnlyFn("vault-v6", "get-fee-balance", [], deployer).result).toBeUint(fee);
  });

  it("owner can collect the accrued fee revenue to the fee-collector", () => {
    deposit(DEPOSIT, wallet1);
    addYield(1_000_000n);
    withdraw(wallet1);
    const fee = 1_000_000n * 500n / 10000n;
    const collectorBefore = sbtcBalance(deployer);
    expect(simnet.callPublicFn("vault-v6", "collect-fee", [SBTC], deployer).result).toBeOk(Cl.uint(fee));
    expect(sbtcBalance(deployer)).toBe(collectorBefore + fee);
    expect(simnet.callReadOnlyFn("vault-v6", "get-fee-balance", [], deployer).result).toBeUint(0n);
  });
});

describe("zest-earn-adapter (sync) — access control", () => {
  it("rejects deposit from a non-vault caller", () => {
    expect(
      simnet.callPublicFn(ADAPTER, "deposit", [Cl.uint(1000), Cl.principal(wallet1)], wallet1).result
    ).toBeErr(Cl.uint(103));
  });

  it("blocks new deposits when paused, but withdrawals still work", () => {
    deposit(DEPOSIT, wallet1);
    simnet.callPublicFn("vault-v6", "set-adapter-paused", [adapterCV, Cl.bool(true)], deployer);
    expect(deposit(DEPOSIT, wallet1).result).toBeErr(Cl.uint(102));
    expect(withdraw(wallet1).result).toBeOk(Cl.uint(DEPOSIT));
  });
});

describe("vault-v6 — admin migration (forced exit to the position OWNER)", () => {
  it("SECURITY: owner triggers the exit, but funds go to the USER — never the owner", () => {
    const userBefore = sbtcBalance(wallet1);
    deposit(DEPOSIT, wallet1);
    const YIELD = 1_000_000n;
    addYield(YIELD);
    const fee = YIELD * 500n / 10000n;
    const expectedPayout = DEPOSIT + (YIELD - fee);

    const ownerBefore = sbtcBalance(deployer);
    // deployer (the contract owner) triggers the exit of wallet1's position
    expect(adminExit(wallet1, deployer).result).toBeOk(Cl.uint(expectedPayout));
    // the USER receives principal + net yield
    expect(sbtcBalance(wallet1)).toBe(userBefore + (YIELD - fee));
    // the OWNER receives NOTHING from the exit (the fee only accrues to fee-balance)
    expect(sbtcBalance(deployer)).toBe(ownerBefore);
    expect(simnet.callReadOnlyFn("vault-v6", "get-fee-balance", [], deployer).result).toBeUint(fee);
  });

  it("PRINCIPAL PROTECTED: zero-yield admin-exit returns exactly the principal to the user", () => {
    const userBefore = sbtcBalance(wallet1);
    deposit(DEPOSIT, wallet1);
    expect(adminExit(wallet1, deployer).result).toBeOk(Cl.uint(DEPOSIT));
    expect(sbtcBalance(wallet1)).toBe(userBefore);
  });

  it("is owner-only — the position owner themselves cannot call it", () => {
    deposit(DEPOSIT, wallet1);
    expect(adminExit(wallet1, wallet1).result).toBeErr(Cl.uint(100));
  });

  it("clears the position (no double-exit) and frees the TVL for re-entry", () => {
    deposit(DEPOSIT, wallet1);
    expect(adminExit(wallet1, deployer).result).toBeOk(Cl.uint(DEPOSIT));
    // position is gone — a second exit fails with no-position
    expect(adminExit(wallet1, deployer).result).toBeErr(Cl.uint(105));
    expect(simnet.callReadOnlyFn("vault-v6", "get-total-deposited", [], deployer).result).toBeUint(0n);
    // user can immediately re-deposit (e.g. into the migrated vault)
    expect(deposit(DEPOSIT, wallet1).result).toBeOk(Cl.uint(DEPOSIT));
  });
});
