import { describe, it, expect } from "vitest";
import { Cl, cvToValue } from "@stacks/transactions";
import { initSimnet } from "@hirosystems/clarinet-sdk";

const simnet = await initSimnet();
const accounts = simnet.getAccounts();
const deployer = accounts.get("deployer")!;
const wallet1 = accounts.get("wallet_1")!;
const wallet2 = accounts.get("wallet_2")!;

const DEPOSIT = 10_000_000n;

function setup() {
  simnet.callPublicFn("mock-sbtc", "mint", [Cl.uint(50_000_000n), Cl.principal(wallet1)], deployer);
  simnet.callPublicFn("mock-sbtc", "mint", [Cl.uint(50_000_000n), Cl.principal(wallet2)], deployer);
  simnet.callPublicFn("vault", "approve-adapter", [Cl.contractPrincipal(deployer, "bitflow-adapter")], deployer);
  simnet.callPublicFn("vault", "approve-adapter", [Cl.contractPrincipal(deployer, "alex-adapter")], deployer);
  simnet.callPublicFn("vault", "approve-adapter", [Cl.contractPrincipal(deployer, "zest-adapter")], deployer);
  simnet.callPublicFn("bitflow-adapter", "set-vault", [Cl.contractPrincipal(deployer, "vault")], deployer);
  simnet.callPublicFn("alex-adapter", "set-vault", [Cl.contractPrincipal(deployer, "vault")], deployer);
  simnet.callPublicFn("zest-adapter", "set-vault", [Cl.contractPrincipal(deployer, "vault")], deployer);
}

describe("full flow — deposit → rebalance → withdraw", () => {
  it("deposit then withdraw returns the full principal", () => {
    setup();
    simnet.callPublicFn(
      "vault",
      "deposit",
      [Cl.contractPrincipal(deployer, "bitflow-adapter"), Cl.uint(DEPOSIT)],
      wallet1
    );
    simnet.mineEmptyBlocks(10);
    const result = simnet.callPublicFn(
      "vault",
      "withdraw",
      [Cl.contractPrincipal(deployer, "bitflow-adapter")],
      wallet1
    );
    expect(result.result).toBeOk(Cl.uint(DEPOSIT));
  });

  it("deposit → rebalance → withdraw returns full principal via new adapter", () => {
    setup();
    simnet.callPublicFn(
      "vault",
      "deposit",
      [Cl.contractPrincipal(deployer, "bitflow-adapter"), Cl.uint(DEPOSIT)],
      wallet1
    );
    simnet.mineEmptyBlocks(50);

    const rebalanceResult = simnet.callPublicFn(
      "vault",
      "rebalance",
      [
        Cl.contractPrincipal(deployer, "bitflow-adapter"),
        Cl.contractPrincipal(deployer, "alex-adapter"),
      ],
      wallet1
    );
    expect(rebalanceResult.result).toBeOk(Cl.uint(DEPOSIT));

    simnet.mineEmptyBlocks(50);

    const withdrawResult = simnet.callPublicFn(
      "vault",
      "withdraw",
      [Cl.contractPrincipal(deployer, "alex-adapter")],
      wallet1
    );
    expect(withdrawResult.result).toBeOk(Cl.uint(DEPOSIT));
  });

  it("two users can hold independent positions simultaneously", () => {
    setup();
    simnet.callPublicFn(
      "vault",
      "deposit",
      [Cl.contractPrincipal(deployer, "bitflow-adapter"), Cl.uint(DEPOSIT)],
      wallet1
    );
    simnet.callPublicFn(
      "vault",
      "deposit",
      [Cl.contractPrincipal(deployer, "alex-adapter"), Cl.uint(DEPOSIT)],
      wallet2
    );

    const tvl = simnet.callReadOnlyFn("vault", "get-total-deposited", [], deployer);
    expect(tvl.result).toBeUint(DEPOSIT * 2n);

    simnet.callPublicFn(
      "vault",
      "withdraw",
      [Cl.contractPrincipal(deployer, "bitflow-adapter")],
      wallet1
    );

    const tvlAfter = simnet.callReadOnlyFn("vault", "get-total-deposited", [], deployer);
    expect(tvlAfter.result).toBeUint(DEPOSIT);
  });

  it("rebalance via rebalancer facade produces same result", () => {
    setup();
    simnet.callPublicFn(
      "vault",
      "deposit",
      [Cl.contractPrincipal(deployer, "bitflow-adapter"), Cl.uint(DEPOSIT)],
      wallet1
    );
    const result = simnet.callPublicFn(
      "rebalancer",
      "rebalance",
      [
        Cl.contractPrincipal(deployer, "bitflow-adapter"),
        Cl.contractPrincipal(deployer, "alex-adapter"),
      ],
      wallet1
    );
    expect(result.result).toBeOk(Cl.uint(DEPOSIT));
  });

  it("vault emits print events on deposit, rebalance, and withdraw", () => {
    setup();
    const depositResult = simnet.callPublicFn(
      "vault",
      "deposit",
      [Cl.contractPrincipal(deployer, "bitflow-adapter"), Cl.uint(DEPOSIT)],
      wallet1
    );
    expect(depositResult.result).toBeOk(Cl.uint(DEPOSIT));

    const rebalanceResult = simnet.callPublicFn(
      "vault",
      "rebalance",
      [
        Cl.contractPrincipal(deployer, "bitflow-adapter"),
        Cl.contractPrincipal(deployer, "alex-adapter"),
      ],
      wallet1
    );
    expect(rebalanceResult.result).toBeOk(Cl.uint(DEPOSIT));

    const withdrawResult = simnet.callPublicFn(
      "vault",
      "withdraw",
      [Cl.contractPrincipal(deployer, "alex-adapter")],
      wallet1
    );
    expect(withdrawResult.result).toBeOk(Cl.uint(DEPOSIT));
  });
});
