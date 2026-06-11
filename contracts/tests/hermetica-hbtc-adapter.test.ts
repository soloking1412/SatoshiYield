import { describe, it, expect, beforeEach } from "vitest";
import { Cl, cvToValue } from "@stacks/transactions";
import { initSimnet } from "@hirosystems/clarinet-sdk";

/**
 * Full-stack ASYNC test: vault-v6 -> hermetica-hbtc-adapter -> shim (vault-hbtc-v1-2).
 * Proves the two-phase async-withdrawal path:
 *   deposit-async -> (yield accrues) -> request-withdraw -> (manager funds claim)
 *   -> claim-withdraw: user gets principal + 95% of yield, vault books 5% fee.
 * Also proves the cancel escape hatch and vault-only access control.
 *
 * The hBTC vault is a pure-accounting simnet shim (tests/_shims), applied to the
 * requirement cache by the `pretest` script. The real contract is validated via
 * a mainnet fork before approval.
 */

const simnet = await initSimnet();
const accounts = simnet.getAccounts();
const deployer = accounts.get("deployer")!;
const wallet1 = accounts.get("wallet_1")!;
const wallet2 = accounts.get("wallet_2")!;
const oracle1 = accounts.get("wallet_3")!;
const oracle2 = accounts.get("wallet_4")!;

const MINT = 100_000_000n;
const DEPOSIT = 10_000_000n;
const ADAPTER = "hermetica-hbtc-adapter";
const HBTC_SHIM = "SP1S1HSFH0SQQGWKB69EYFNY0B1MHRMGXR3J1FH4D.vault-hbtc-v1-2";

const SBTC = Cl.contractPrincipal(deployer, "mock-sbtc");
const adapterCV = Cl.contractPrincipal(deployer, ADAPTER);
const vaultCV = Cl.contractPrincipal(deployer, "vault-v6");

function setup() {
  simnet.callPublicFn("mock-sbtc", "mint", [Cl.uint(MINT), Cl.principal(wallet1)], deployer);
  simnet.callPublicFn("vault-v6", "set-sbtc-token", [SBTC], deployer);
  simnet.callPublicFn("vault-v6", "approve-adapter", [adapterCV, Cl.bool(true)], deployer); // async
  simnet.callPublicFn(ADAPTER, "set-vault", [vaultCV], deployer);
  simnet.callPublicFn(ADAPTER, "set-oracle-at", [Cl.uint(0), Cl.principal(oracle1)], deployer);
  simnet.callPublicFn(ADAPTER, "set-oracle-at", [Cl.uint(1), Cl.principal(oracle2)], deployer);
  simnet.callPublicFn(ADAPTER, "set-apy", [Cl.uint(800)], oracle1);
  simnet.callPublicFn(ADAPTER, "set-apy", [Cl.uint(800)], oracle2);
}

const depositAsync = (amount: bigint, sender: string) =>
  simnet.callPublicFn("vault-v6", "deposit-async", [SBTC, adapterCV, Cl.uint(amount)], sender);
const requestWithdraw = (sender: string) =>
  simnet.callPublicFn("vault-v6", "request-withdraw", [adapterCV], sender);
const claimWithdraw = (sender: string) =>
  simnet.callPublicFn("vault-v6", "claim-withdraw", [SBTC, adapterCV], sender);
const cancelWithdraw = (sender: string) =>
  simnet.callPublicFn("vault-v6", "cancel-withdraw", [adapterCV], sender);
const fundClaim = (id: bigint) =>
  simnet.callPublicFn(HBTC_SHIM, "fund-claim", [Cl.uint(id)], deployer);
const addYield = (amount: bigint) => {
  simnet.callPublicFn(HBTC_SHIM, "add-yield", [Cl.uint(amount)], deployer);
  simnet.callPublicFn("mock-sbtc", "mint",
    [Cl.uint(amount), Cl.contractPrincipal(deployer, ADAPTER)], deployer);
};
function sbtcBalance(who: string): bigint {
  const r = simnet.callReadOnlyFn("mock-sbtc", "get-balance", [Cl.principal(who)], deployer);
  return BigInt(cvToValue(r.result).value);
}
function positionStatus(user: string): bigint {
  const r = simnet.callReadOnlyFn("vault-v6", "get-position", [Cl.principal(user)], deployer);
  return BigInt(cvToValue(r.result).value.status.value);
}
beforeEach(setup);

describe("hermetica-hbtc-adapter (async) — deposit + two-phase withdraw", () => {
  it("deposit-async routes sBTC into hBTC and records shares", () => {
    const before = sbtcBalance(wallet1);
    expect(depositAsync(DEPOSIT, wallet1).result).toBeOk(Cl.uint(DEPOSIT));
    expect(sbtcBalance(wallet1)).toBe(before - DEPOSIT);
    const shares = simnet.callReadOnlyFn(ADAPTER, "get-shares", [Cl.principal(wallet1)], deployer);
    expect(BigInt(cvToValue(shares.result))).toBe(DEPOSIT);
    expect(positionStatus(wallet1)).toBe(0n); // active
  });

  it("REVENUE: request -> fund -> claim returns principal + 95% yield; vault books 5%", () => {
    const before = sbtcBalance(wallet1);
    depositAsync(DEPOSIT, wallet1);
    const YIELD = 1_000_000n;
    addYield(YIELD);

    const reqRes = requestWithdraw(wallet1);
    expect(reqRes.result).toBeOk(Cl.uint(1)); // claim id 1
    expect(positionStatus(wallet1)).toBe(1n); // pending

    fundClaim(1n); // Hermetica manager funds the claim

    const fee = YIELD * 500n / 10000n;
    const expectedPayout = DEPOSIT + (YIELD - fee);
    expect(claimWithdraw(wallet1).result).toBeOk(Cl.uint(expectedPayout));
    expect(sbtcBalance(wallet1)).toBe(before + (YIELD - fee));
    expect(simnet.callReadOnlyFn("vault-v6", "get-fee-balance", [], deployer).result).toBeUint(fee);
    // position closed
    const pos = simnet.callReadOnlyFn("vault-v6", "get-position", [Cl.principal(wallet1)], deployer);
    expect(pos.result).toBeNone();
  });

  it("PRINCIPAL PROTECTED: zero-yield claim returns exactly the principal", () => {
    const before = sbtcBalance(wallet1);
    depositAsync(DEPOSIT, wallet1);
    requestWithdraw(wallet1);
    fundClaim(1n);
    expect(claimWithdraw(wallet1).result).toBeOk(Cl.uint(DEPOSIT));
    expect(sbtcBalance(wallet1)).toBe(before);
    expect(simnet.callReadOnlyFn("vault-v6", "get-fee-balance", [], deployer).result).toBeUint(0n);
  });

  it("claim before request is rejected (not pending)", () => {
    depositAsync(DEPOSIT, wallet1);
    expect(claimWithdraw(wallet1).result).toBeErr(Cl.uint(121)); // err-not-pending
  });

  it("cannot claim an unfunded claim", () => {
    depositAsync(DEPOSIT, wallet1);
    requestWithdraw(wallet1);
    // not funded yet -> shim redeem fails (ERR-NOT-FUNDED u103006)
    expect(claimWithdraw(wallet1).result).toBeErr(Cl.uint(103006));
  });
});

describe("hermetica-hbtc-adapter (async) — cancel escape hatch", () => {
  it("cancel restores the active position (funds never stuck)", () => {
    depositAsync(DEPOSIT, wallet1);
    requestWithdraw(wallet1);
    expect(positionStatus(wallet1)).toBe(1n); // pending
    expect(cancelWithdraw(wallet1).result).toBeOk(Cl.bool(true));
    expect(positionStatus(wallet1)).toBe(0n); // active again
    // can re-request afterwards
    expect(requestWithdraw(wallet1).result).toBeOk(Cl.uint(2));
  });
});

describe("hermetica-hbtc-adapter (async) — C1: no cross-user fund sweep", () => {
  it("each user's claim returns ONLY their own funds from the pooled adapter", () => {
    // Two users with concurrent funded claims co-mingle in the pooled adapter.
    // With the old full-balance-forward, the first claimant would sweep both;
    // claim-withdraw must forward only this claim's redeemed amount.
    simnet.callPublicFn("mock-sbtc", "mint", [Cl.uint(MINT), Cl.principal(wallet2)], deployer);
    const a0 = sbtcBalance(wallet1);
    const b0 = sbtcBalance(wallet2);

    expect(depositAsync(DEPOSIT, wallet1).result).toBeOk(Cl.uint(DEPOSIT));
    expect(depositAsync(DEPOSIT, wallet2).result).toBeOk(Cl.uint(DEPOSIT));

    expect(requestWithdraw(wallet1).result).toBeOk(Cl.uint(1));
    expect(requestWithdraw(wallet2).result).toBeOk(Cl.uint(2));
    fundClaim(1n);
    fundClaim(2n);

    // wallet1 claims first — must get back exactly its own principal, NOT both.
    expect(claimWithdraw(wallet1).result).toBeOk(Cl.uint(DEPOSIT));
    expect(sbtcBalance(wallet1)).toBe(a0); // back to start — no theft of wallet2's funds

    // wallet2 is NOT stranded — it can still claim its own principal.
    expect(claimWithdraw(wallet2).result).toBeOk(Cl.uint(DEPOSIT));
    expect(sbtcBalance(wallet2)).toBe(b0);
  });
});

describe("hermetica-hbtc-adapter (async) — access control", () => {
  it("rejects deposit / request / claim from a non-vault caller", () => {
    expect(
      simnet.callPublicFn(ADAPTER, "deposit", [Cl.uint(1000), Cl.principal(wallet1)], wallet1).result
    ).toBeErr(Cl.uint(103));
    expect(
      simnet.callPublicFn(ADAPTER, "request-withdraw", [Cl.uint(1000), Cl.principal(wallet1)], wallet1).result
    ).toBeErr(Cl.uint(103));
    expect(
      simnet.callPublicFn(ADAPTER, "claim-withdraw", [Cl.uint(1000), Cl.principal(wallet1), SBTC], wallet1).result
    ).toBeErr(Cl.uint(103));
  });
});
