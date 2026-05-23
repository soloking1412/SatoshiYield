import { describe, it, expect, beforeEach } from "vitest";
import { Cl, cvToValue } from "@stacks/transactions";
import { initSimnet } from "@hirosystems/clarinet-sdk";

const simnet = await initSimnet();
const accounts = simnet.getAccounts();
const deployer = accounts.get("deployer")!;
const wallet1 = accounts.get("wallet_1")!;
const wallet2 = accounts.get("wallet_2")!;
const oracle1 = accounts.get("wallet_3")!;
const oracle2 = accounts.get("wallet_4")!;

const MINT = 100_000_000n;
const DEPOSIT = 10_000_000n;
const ADAPTERS = [
  "bitflow-adapter-v4",
  "alex-adapter-v4",
  "zest-adapter-v4",
  "velar-adapter-v4",
];

const SBTC = Cl.contractPrincipal(deployer, "mock-sbtc");
const adapter = (name: string) => Cl.contractPrincipal(deployer, name);

/** Fully initialise the v5 system: token, adapters, oracles, a committed APY. */
function setupV5() {
  simnet.callPublicFn("mock-sbtc", "mint", [Cl.uint(MINT), Cl.principal(wallet1)], deployer);
  simnet.callPublicFn("mock-sbtc", "mint", [Cl.uint(MINT), Cl.principal(wallet2)], deployer);
  simnet.callPublicFn("vault-v5", "set-sbtc-token", [SBTC], deployer);
  for (const a of ADAPTERS) {
    simnet.callPublicFn("vault-v5", "approve-adapter", [adapter(a)], deployer);
    simnet.callPublicFn(a, "set-vault", [Cl.contractPrincipal(deployer, "vault-v5")], deployer);
    simnet.callPublicFn(a, "set-oracle-at", [Cl.uint(0), Cl.principal(oracle1)], deployer);
    simnet.callPublicFn(a, "set-oracle-at", [Cl.uint(1), Cl.principal(oracle2)], deployer);
    // Two oracles agree -> 2-of-3 consensus commits, so get-apy is fresh and
    // deposits are not blocked by the stale-oracle guard.
    simnet.callPublicFn(a, "set-apy", [Cl.uint(500)], oracle1);
    simnet.callPublicFn(a, "set-apy", [Cl.uint(500)], oracle2);
  }
}

const deposit = (a: string, amount: bigint, sender: string) =>
  simnet.callPublicFn("vault-v5", "deposit", [SBTC, adapter(a), Cl.uint(amount)], sender);
const withdraw = (a: string, sender: string) =>
  simnet.callPublicFn("vault-v5", "withdraw", [SBTC, adapter(a)], sender);
const rebalance = (from: string, to: string, sender: string) =>
  simnet.callPublicFn("vault-v5", "rebalance", [SBTC, adapter(from), adapter(to)], sender);

function sbtcBalance(who: string): bigint {
  const r = simnet.callReadOnlyFn("mock-sbtc", "get-balance", [Cl.principal(who)], deployer);
  return BigInt(cvToValue(r.result).value);
}
function lastUpdatedBlock(a: string): bigint {
  const r = simnet.callReadOnlyFn(a, "get-last-updated-block", [], deployer);
  return BigInt(cvToValue(r.result).value);
}

beforeEach(setupV5);

describe("vault-v5 — token-trait deposit / withdraw", () => {
  it("deposit then withdraw round-trips exactly the principal", () => {
    const before = sbtcBalance(wallet1);
    expect(deposit("bitflow-adapter-v4", DEPOSIT, wallet1).result).toBeOk(Cl.uint(DEPOSIT));
    expect(sbtcBalance(wallet1)).toBe(before - DEPOSIT);
    expect(withdraw("bitflow-adapter-v4", wallet1).result).toBeOk(Cl.uint(DEPOSIT));
    expect(sbtcBalance(wallet1)).toBe(before);
  });

  it("withdraw clears the position and total-deposited", () => {
    deposit("bitflow-adapter-v4", DEPOSIT, wallet1);
    withdraw("bitflow-adapter-v4", wallet1);
    const pos = simnet.callReadOnlyFn("vault-v5", "get-position", [Cl.principal(wallet1)], wallet1);
    expect(pos.result).toBeNone();
    const tvl = simnet.callReadOnlyFn("vault-v5", "get-total-deposited", [], deployer);
    expect(tvl.result).toBeUint(0n);
  });

  it("two users hold independent positions; TVL reconciles", () => {
    deposit("bitflow-adapter-v4", DEPOSIT, wallet1);
    deposit("alex-adapter-v4", DEPOSIT, wallet2);
    const tvl = simnet.callReadOnlyFn("vault-v5", "get-total-deposited", [], deployer);
    expect(tvl.result).toBeUint(DEPOSIT * 2n);
  });

  it("rejects a second deposit while a position is active", () => {
    deposit("bitflow-adapter-v4", DEPOSIT, wallet1);
    expect(deposit("alex-adapter-v4", DEPOSIT, wallet1).result).toBeErr(Cl.uint(109));
  });

  it("rejects withdraw with the wrong adapter", () => {
    deposit("bitflow-adapter-v4", DEPOSIT, wallet1);
    expect(withdraw("alex-adapter-v4", wallet1).result).toBeErr(Cl.uint(108));
  });

  it("set-sbtc-token is one-shot", () => {
    expect(
      simnet.callPublicFn("vault-v5", "set-sbtc-token", [SBTC], deployer).result
    ).toBeErr(Cl.uint(116)); // err-sbtc-already-set
  });
});

describe("vault-v5 — rebalance", () => {
  it("rebalances A->B and moves the position", () => {
    deposit("bitflow-adapter-v4", DEPOSIT, wallet1);
    expect(rebalance("bitflow-adapter-v4", "alex-adapter-v4", wallet1).result)
      .toBeOk(Cl.uint(DEPOSIT));
    const pos = simnet.callReadOnlyFn("vault-v5", "get-position", [Cl.principal(wallet1)], wallet1);
    expect(cvToValue(pos.result).value.adapter.value).toContain("alex-adapter-v4");
  });

  it("rejects rebalance to the same adapter (err-same-adapter)", () => {
    deposit("bitflow-adapter-v4", DEPOSIT, wallet1);
    expect(rebalance("bitflow-adapter-v4", "bitflow-adapter-v4", wallet1).result)
      .toBeErr(Cl.uint(117)); // err-same-adapter
  });

  it("rebalance then withdraw still returns the full principal", () => {
    const before = sbtcBalance(wallet1);
    deposit("bitflow-adapter-v4", DEPOSIT, wallet1);
    rebalance("bitflow-adapter-v4", "zest-adapter-v4", wallet1);
    expect(withdraw("zest-adapter-v4", wallet1).result).toBeOk(Cl.uint(DEPOSIT));
    expect(sbtcBalance(wallet1)).toBe(before);
  });
});

describe("adapter-v4 — oracle 2-of-3 consensus", () => {
  it("commits the average once two fresh oracles agree", () => {
    // setupV5 pushed 500 from both oracles -> consensus committed
    const apy = simnet.callReadOnlyFn("bitflow-adapter-v4", "get-apy", [], deployer);
    expect(apy.result).toBeOk(Cl.uint(500n));
  });

  it("rejects set-apy from a non-oracle", () => {
    expect(
      simnet.callPublicFn("bitflow-adapter-v4", "set-apy", [Cl.uint(600)], wallet1).result
    ).toBeErr(Cl.uint(100)); // err-not-owner
  });

  it("ignores a stale oracle report older than STALE-BLOCKS (H-3 fix)", () => {
    const lastBefore = lastUpdatedBlock("bitflow-adapter-v4");
    // Age every existing report past the 720-block staleness window.
    simnet.mineEmptyBlocks(721);
    // One fresh report: its only potential partners are now stale -> no consensus.
    simnet.callPublicFn("bitflow-adapter-v4", "set-apy", [Cl.uint(520)], oracle1);
    expect(lastUpdatedBlock("bitflow-adapter-v4")).toBe(lastBefore);
    // A second fresh report -> consensus forms from two FRESH reports only.
    simnet.callPublicFn("bitflow-adapter-v4", "set-apy", [Cl.uint(520)], oracle2);
    const apy = simnet.callReadOnlyFn("bitflow-adapter-v4", "get-apy", [], deployer);
    expect(apy.result).toBeOk(Cl.uint(520n));
  });
});
