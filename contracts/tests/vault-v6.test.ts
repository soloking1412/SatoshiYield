import { describe, it, expect, beforeEach } from "vitest";
import { Cl, cvToValue } from "@stacks/transactions";
import { initSimnet } from "@hirosystems/clarinet-sdk";

/**
 * vault-v6 core mechanics (using zest-earn-adapter as the SYNC adapter):
 * TVL cap, min-deposit, pause, one-position, approval, owner gating, one-shot
 * sBTC, and the timelocked fee change.
 */

const simnet = await initSimnet();
const accounts = simnet.getAccounts();
const deployer = accounts.get("deployer")!;
const wallet1 = accounts.get("wallet_1")!;
const oracle1 = accounts.get("wallet_3")!;
const oracle2 = accounts.get("wallet_4")!;

const MINT = 100_000_000n;
const ADAPTER = "zest-earn-adapter";
const SBTC = Cl.contractPrincipal(deployer, "mock-sbtc");
const adapterCV = Cl.contractPrincipal(deployer, ADAPTER);

function setup() {
  simnet.callPublicFn("mock-sbtc", "mint", [Cl.uint(MINT), Cl.principal(wallet1)], deployer);
  simnet.callPublicFn("vault-v6", "set-sbtc-token", [SBTC], deployer);
  simnet.callPublicFn("vault-v6", "approve-adapter", [adapterCV, Cl.bool(false)], deployer);
  simnet.callPublicFn(ADAPTER, "set-vault", [Cl.contractPrincipal(deployer, "vault-v6")], deployer);
  simnet.callPublicFn(ADAPTER, "set-oracle-at", [Cl.uint(0), Cl.principal(oracle1)], deployer);
  simnet.callPublicFn(ADAPTER, "set-oracle-at", [Cl.uint(1), Cl.principal(oracle2)], deployer);
  simnet.callPublicFn(ADAPTER, "set-apy", [Cl.uint(400)], oracle1);
  simnet.callPublicFn(ADAPTER, "set-apy", [Cl.uint(400)], oracle2);
}
const deposit = (amount: bigint, sender: string) =>
  simnet.callPublicFn("vault-v6", "deposit", [SBTC, adapterCV, Cl.uint(amount)], sender);
beforeEach(setup);

describe("vault-v6 — deposit guards", () => {
  it("rejects a deposit below MIN-DEPOSIT", () => {
    expect(deposit(500n, wallet1).result).toBeErr(Cl.uint(104)); // err-below-min
  });

  it("rejects a deposit that exceeds the TVL cap", () => {
    expect(deposit(60_000_000n, wallet1).result).toBeErr(Cl.uint(103)); // err-cap-exceeded (cap 0.5 sBTC)
  });

  it("blocks deposits while globally paused", () => {
    simnet.callPublicFn("vault-v6", "set-global-paused", [Cl.bool(true)], deployer);
    expect(deposit(10_000_000n, wallet1).result).toBeErr(Cl.uint(101)); // err-global-paused
  });

  it("enforces one position per user", () => {
    expect(deposit(10_000_000n, wallet1).result).toBeOk(Cl.uint(10_000_000n));
    expect(deposit(10_000_000n, wallet1).result).toBeErr(Cl.uint(109)); // err-already-active
  });

  it("rejects deposits into an unapproved adapter", () => {
    simnet.callPublicFn("vault-v6", "revoke-adapter", [adapterCV], deployer);
    expect(deposit(10_000_000n, wallet1).result).toBeErr(Cl.uint(107)); // err-not-approved
  });
});

describe("vault-v6 — owner gating", () => {
  it("only the owner can pause / approve / set cap", () => {
    expect(simnet.callPublicFn("vault-v6", "set-global-paused", [Cl.bool(true)], wallet1).result)
      .toBeErr(Cl.uint(100));
    expect(simnet.callPublicFn("vault-v6", "approve-adapter", [adapterCV, Cl.bool(false)], wallet1).result)
      .toBeErr(Cl.uint(100));
    expect(simnet.callPublicFn("vault-v6", "set-tvl-cap", [Cl.uint(99_000_000n)], wallet1).result)
      .toBeErr(Cl.uint(100));
  });

  it("set-sbtc-token is one-shot", () => {
    expect(simnet.callPublicFn("vault-v6", "set-sbtc-token", [SBTC], deployer).result)
      .toBeErr(Cl.uint(116)); // err-sbtc-already-set
  });

  it("set-tvl-cap cannot drop below current total-deposited", () => {
    deposit(10_000_000n, wallet1);
    expect(simnet.callPublicFn("vault-v6", "set-tvl-cap", [Cl.uint(1_000_000n)], deployer).result)
      .toBeErr(Cl.uint(103)); // err-cap-exceeded
  });
});

describe("vault-v6 — timelocked fee change", () => {
  it("a scheduled fee cannot be applied before the timelock elapses", () => {
    const sched = simnet.callPublicFn("vault-v6", "schedule-fee-basis-points", [Cl.uint(300)], deployer);
    const effectiveAt = BigInt(cvToValue(sched.result).value);
    expect(simnet.callPublicFn("vault-v6", "apply-fee-basis-points", [Cl.uint(effectiveAt)], deployer).result)
      .toBeErr(Cl.uint(110)); // err-timelock
    simnet.mineEmptyBlocks(145);
    expect(simnet.callPublicFn("vault-v6", "apply-fee-basis-points", [Cl.uint(effectiveAt)], deployer).result)
      .toBeOk(Cl.uint(300));
    expect(simnet.callReadOnlyFn("vault-v6", "get-fee-basis-points", [], deployer).result).toBeUint(300n);
  });

  it("rejects a scheduled fee above the max", () => {
    expect(simnet.callPublicFn("vault-v6", "schedule-fee-basis-points", [Cl.uint(1500)], deployer).result)
      .toBeErr(Cl.uint(106)); // err-fee-overflow (MAX-FEE-BPS = 1000)
  });
});
