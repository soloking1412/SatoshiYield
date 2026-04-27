import { describe, it, expect, beforeEach } from "vitest";
import { Cl, cvToValue, ClarityType } from "@stacks/transactions";
import { initSimnet } from "@hirosystems/clarinet-sdk";

const simnet = await initSimnet();
const accounts = simnet.getAccounts();
const deployer = accounts.get("deployer")!;
const wallet1 = accounts.get("wallet_1")!;
const wallet2 = accounts.get("wallet_2")!;

const MINT_AMOUNT = 100_000_000n;
const DEPOSIT_AMOUNT = 10_000_000n;

function mintTokens(recipient: string, amount: bigint) {
  return simnet.callPublicFn(
    "mock-sbtc",
    "mint",
    [Cl.uint(amount), Cl.principal(recipient)],
    deployer
  );
}

function approveAdapter(adapter: string) {
  return simnet.callPublicFn(
    "vault",
    "approve-adapter",
    [Cl.contractPrincipal(deployer, adapter)],
    deployer
  );
}

function deposit(adapter: string, amount: bigint, sender: string) {
  return simnet.callPublicFn(
    "vault",
    "deposit",
    [Cl.contractPrincipal(deployer, adapter), Cl.uint(amount)],
    sender
  );
}

function withdraw(adapter: string, sender: string) {
  return simnet.callPublicFn(
    "vault",
    "withdraw",
    [Cl.contractPrincipal(deployer, adapter)],
    sender
  );
}

function initAdapter(adapter: string) {
  return simnet.callPublicFn(
    adapter,
    "set-vault",
    [Cl.contractPrincipal(deployer, "vault")],
    deployer
  );
}

beforeEach(() => {
  mintTokens(wallet1, MINT_AMOUNT);
  mintTokens(wallet2, MINT_AMOUNT);
  approveAdapter("bitflow-adapter");
  approveAdapter("alex-adapter");
  initAdapter("bitflow-adapter");
  initAdapter("alex-adapter");
});

describe("vault — deposit", () => {
  it("accepts a valid deposit and records the position", () => {
    const result = deposit("bitflow-adapter", DEPOSIT_AMOUNT, wallet1);
    expect(result.result).toBeOk(Cl.uint(DEPOSIT_AMOUNT));

    const position = simnet.callReadOnlyFn(
      "vault",
      "get-position",
      [Cl.principal(wallet1)],
      wallet1
    );
    expect(position.result.type).toBe(ClarityType.OptionalSome);
  });

  it("increases total-deposited by the deposit amount", () => {
    deposit("bitflow-adapter", DEPOSIT_AMOUNT, wallet1);
    const tvl = simnet.callReadOnlyFn("vault", "get-total-deposited", [], deployer);
    expect(tvl.result).toBeUint(DEPOSIT_AMOUNT);
  });

  it("rejects a second deposit while a position is already active", () => {
    deposit("bitflow-adapter", DEPOSIT_AMOUNT, wallet1);
    const second = deposit("bitflow-adapter", DEPOSIT_AMOUNT, wallet1);
    expect(second.result).toBeErr(Cl.uint(109)); // err-already-active
  });

  it("rejects a zero-amount deposit", () => {
    const result = deposit("bitflow-adapter", 0n, wallet1);
    expect(result.result).toBeErr(Cl.uint(104)); // err-zero-amount
  });

  it("rejects deposit when global pause is active", () => {
    simnet.callPublicFn("vault", "set-global-paused", [Cl.bool(true)], deployer);
    const result = deposit("bitflow-adapter", DEPOSIT_AMOUNT, wallet1);
    expect(result.result).toBeErr(Cl.uint(101)); // err-global-paused
    simnet.callPublicFn("vault", "set-global-paused", [Cl.bool(false)], deployer);
  });

  it("rejects deposit when adapter pause is active", () => {
    simnet.callPublicFn(
      "vault",
      "set-adapter-paused",
      [Cl.contractPrincipal(deployer, "bitflow-adapter"), Cl.bool(true)],
      deployer
    );
    const result = deposit("bitflow-adapter", DEPOSIT_AMOUNT, wallet1);
    expect(result.result).toBeErr(Cl.uint(102)); // err-adapter-paused
    simnet.callPublicFn(
      "vault",
      "set-adapter-paused",
      [Cl.contractPrincipal(deployer, "bitflow-adapter"), Cl.bool(false)],
      deployer
    );
  });

  it("rejects deposit when TVL cap would be exceeded", () => {
    simnet.callPublicFn("vault", "set-tvl-cap", [Cl.uint(5_000_000n)], deployer);
    const result = deposit("bitflow-adapter", DEPOSIT_AMOUNT, wallet1);
    expect(result.result).toBeErr(Cl.uint(103)); // err-cap-exceeded
    simnet.callPublicFn("vault", "set-tvl-cap", [Cl.uint(150_000_000n)], deployer);
  });

  it("rejects deposit to an unapproved adapter", () => {
    const result = deposit("zest-adapter", DEPOSIT_AMOUNT, wallet1);
    expect(result.result).toBeErr(Cl.uint(107)); // err-not-approved
  });
});

describe("vault — withdraw", () => {
  it("succeeds and returns the deposited amount when no yield accrued", () => {
    deposit("bitflow-adapter", DEPOSIT_AMOUNT, wallet1);
    const result = withdraw("bitflow-adapter", wallet1);
    expect(result.result).toBeOk(Cl.uint(DEPOSIT_AMOUNT));
  });

  it("clears the user position after withdrawal", () => {
    deposit("bitflow-adapter", DEPOSIT_AMOUNT, wallet1);
    withdraw("bitflow-adapter", wallet1);
    const position = simnet.callReadOnlyFn(
      "vault",
      "get-position",
      [Cl.principal(wallet1)],
      wallet1
    );
    expect(position.result).toBeNone();
  });

  it("reduces total-deposited after withdrawal", () => {
    deposit("bitflow-adapter", DEPOSIT_AMOUNT, wallet1);
    withdraw("bitflow-adapter", wallet1);
    const tvl = simnet.callReadOnlyFn("vault", "get-total-deposited", [], deployer);
    expect(tvl.result).toBeUint(0n);
  });

  it("succeeds even when adapter pause is active — withdrawals always open", () => {
    deposit("bitflow-adapter", DEPOSIT_AMOUNT, wallet1);
    simnet.callPublicFn(
      "vault",
      "set-adapter-paused",
      [Cl.contractPrincipal(deployer, "bitflow-adapter"), Cl.bool(true)],
      deployer
    );
    const result = withdraw("bitflow-adapter", wallet1);
    expect(result.result).toBeOk(Cl.uint(DEPOSIT_AMOUNT));
  });

  it("succeeds even when global pause is active — withdrawals always open", () => {
    deposit("bitflow-adapter", DEPOSIT_AMOUNT, wallet1);
    simnet.callPublicFn("vault", "set-global-paused", [Cl.bool(true)], deployer);
    const result = withdraw("bitflow-adapter", wallet1);
    expect(result.result).toBeOk(Cl.uint(DEPOSIT_AMOUNT));
    simnet.callPublicFn("vault", "set-global-paused", [Cl.bool(false)], deployer);
  });

  it("fails with no-position when user has no active deposit", () => {
    const result = withdraw("bitflow-adapter", wallet1);
    expect(result.result).toBeErr(Cl.uint(105)); // err-no-position
  });

  it("fails when the wrong adapter contract is supplied", () => {
    deposit("bitflow-adapter", DEPOSIT_AMOUNT, wallet1);
    const result = withdraw("alex-adapter", wallet1);
    expect(result.result).toBeErr(Cl.uint(108)); // err-wrong-adapter
  });
});

describe("vault — rebalance", () => {
  it("moves the position from one adapter to another", () => {
    deposit("bitflow-adapter", DEPOSIT_AMOUNT, wallet1);
    const result = simnet.callPublicFn(
      "vault",
      "rebalance",
      [
        Cl.contractPrincipal(deployer, "bitflow-adapter"),
        Cl.contractPrincipal(deployer, "alex-adapter"),
      ],
      wallet1
    );
    expect(result.result).toBeOk(Cl.uint(DEPOSIT_AMOUNT));

    const position = simnet.callReadOnlyFn(
      "vault",
      "get-position",
      [Cl.principal(wallet1)],
      wallet1
    );
    const positionData = cvToValue(position.result);
    expect(positionData.value.adapter.value).toContain("alex-adapter");
  });

  it("fails when from-adapter does not match recorded position", () => {
    deposit("bitflow-adapter", DEPOSIT_AMOUNT, wallet1);
    const result = simnet.callPublicFn(
      "vault",
      "rebalance",
      [
        Cl.contractPrincipal(deployer, "alex-adapter"),
        Cl.contractPrincipal(deployer, "zest-adapter"),
      ],
      wallet1
    );
    expect(result.result).toBeErr(Cl.uint(108)); // err-wrong-adapter
  });
});

describe("vault — admin functions", () => {
  it("only owner can set TVL cap", () => {
    const result = simnet.callPublicFn(
      "vault",
      "set-tvl-cap",
      [Cl.uint(200_000_000n)],
      wallet1
    );
    expect(result.result).toBeErr(Cl.uint(100)); // err-not-owner
  });

  it("only owner can approve adapters", () => {
    const result = simnet.callPublicFn(
      "vault",
      "approve-adapter",
      [Cl.contractPrincipal(deployer, "zest-adapter")],
      wallet1
    );
    expect(result.result).toBeErr(Cl.uint(100)); // err-not-owner
  });

  it("only owner can collect fees", () => {
    const result = simnet.callPublicFn("vault", "collect-fee", [], wallet1);
    expect(result.result).toBeErr(Cl.uint(100)); // err-not-owner
  });
});

describe("vault — invariants", () => {
  it("returned amount on withdraw never falls below deposited principal", () => {
    deposit("bitflow-adapter", DEPOSIT_AMOUNT, wallet1);
    const result = withdraw("bitflow-adapter", wallet1);
    const returned = BigInt(cvToValue(result.result).value as string);
    expect(returned).toBeGreaterThanOrEqual(DEPOSIT_AMOUNT);
  });

  it("fee-balance never accumulates when no yield is generated", () => {
    deposit("bitflow-adapter", DEPOSIT_AMOUNT, wallet1);
    withdraw("bitflow-adapter", wallet1);
    const feeBalance = simnet.callReadOnlyFn("vault", "get-fee-balance", [], deployer);
    expect(feeBalance.result).toBeUint(0n);
  });
});
