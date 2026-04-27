import { describe, it, expect } from "vitest";
import { Cl } from "@stacks/transactions";
import { initSimnet } from "@hirosystems/clarinet-sdk";

const simnet = await initSimnet();
const accounts = simnet.getAccounts();
const deployer = accounts.get("deployer")!;
const wallet1 = accounts.get("wallet_1")!;

const DEPOSIT_AMOUNT = 10_000_000n;
const VAULT_PRINCIPAL = `${deployer}.vault`;

function initYieldTracker() {
  return simnet.callPublicFn(
    "yield-tracker",
    "initialize",
    [Cl.contractPrincipal(deployer, "vault")],
    deployer
  );
}

describe("yield-tracker — initialize", () => {
  it("sets the vault principal on first call", () => {
    const result = initYieldTracker();
    expect(result.result).toBeOk(Cl.contractPrincipal(deployer, "vault"));
  });

  it("rejects a second initialization", () => {
    initYieldTracker();
    const second = initYieldTracker();
    expect(second.result).toBeErr(Cl.uint(102)); // err-already-init
  });

  it("rejects initialization from non-owner", () => {
    const result = simnet.callPublicFn(
      "yield-tracker",
      "initialize",
      [Cl.contractPrincipal(deployer, "vault")],
      wallet1
    );
    expect(result.result).toBeErr(Cl.uint(103)); // err-not-owner
  });
});

describe("yield-tracker — access control", () => {
  it("rejects record-deposit calls from non-vault callers", () => {
    initYieldTracker();
    const result = simnet.callPublicFn(
      "yield-tracker",
      "record-deposit",
      [
        Cl.principal(wallet1),
        Cl.uint(DEPOSIT_AMOUNT),
        Cl.contractPrincipal(deployer, "bitflow-adapter"),
      ],
      wallet1
    );
    expect(result.result).toBeErr(Cl.uint(100)); // err-not-vault
  });

  it("rejects record-withdraw calls from non-vault callers", () => {
    initYieldTracker();
    const result = simnet.callPublicFn(
      "yield-tracker",
      "record-withdraw",
      [Cl.principal(wallet1), Cl.uint(DEPOSIT_AMOUNT)],
      wallet1
    );
    expect(result.result).toBeErr(Cl.uint(100)); // err-not-vault
  });
});

describe("yield-tracker — read-only", () => {
  it("get-position-record returns none before any deposit", () => {
    initYieldTracker();
    const record = simnet.callReadOnlyFn(
      "yield-tracker",
      "get-position-record",
      [Cl.principal(wallet1)],
      wallet1
    );
    expect(record.result).toBeNone();
  });

  it("get-event-count returns 0 for a fresh wallet", () => {
    initYieldTracker();
    const count = simnet.callReadOnlyFn(
      "yield-tracker",
      "get-event-count",
      [Cl.principal(wallet1)],
      wallet1
    );
    expect(count.result).toBeUint(0n);
  });
});
