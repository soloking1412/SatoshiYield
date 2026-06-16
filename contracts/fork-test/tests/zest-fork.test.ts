import { describe, it, expect } from "vitest";
import { Cl, cvToValue } from "@stacks/transactions";
import { initSimnet } from "@hirosystems/clarinet-sdk";

/**
 * MAINNET-FORK reproduction of the failing deposit: vault-v6 -> zest-earn-adapter
 * (as-contract) -> the REAL v0-vault-sbtc (NOT the simnet shim). Pinned at the
 * mainnet height where the real failed deposit txs landed, impersonating the
 * exact same depositor wallet, with the exact same amount. If this reproduces
 * the same outcome here, we get full event/trace visibility that the aborted
 * mainnet tx hides.
 */

const simnet = await initSimnet();

const ZEST_ADDR = "SP1A27KFY4XERQCCRCARCYD1CC5N7M6688BSYADJ7";
const ZEST = `${ZEST_ADDR}.v0-vault-sbtc`;
const SBTC_ADDR = "SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4";
const SBTC = `${SBTC_ADDR}.sbtc-token`;

// The exact wallet + amount from the two failed mainnet txs.
const HOLDER = "SP3GMMTM0X3Q3ZRRQRAS6Q5PBMW83ZKBZP81FRQXF";
const AMOUNT = 7868n;

const deployer = simnet.getAccounts().get("deployer")!;
const oracle1 = deployer;
const oracle2 = simnet.getAccounts().get("wallet_1")!;
const T = 300_000; // remote-data is slow

const v = (cv: any): any => cvToValue(cv);
function sbtcBalance(who: string): bigint {
  return BigInt(v(simnet.callReadOnlyFn(SBTC, "get-balance", [Cl.principal(who)], deployer).result).value);
}
function zestAssets(): bigint {
  return BigInt(v(simnet.callReadOnlyFn(ZEST, "get-assets", [], deployer).result).value);
}
function adapterPrincipal(): string {
  return `${deployer}.zest-earn-adapter`;
}

function setup() {
  const SBTC_CV = Cl.contractPrincipal(SBTC_ADDR, "sbtc-token");
  const adapterCV = Cl.contractPrincipal(deployer, "zest-earn-adapter");

  const r1 = simnet.callPublicFn("vault-v6", "set-sbtc-token", [SBTC_CV], deployer);
  console.log("[fork] set-sbtc-token ->", JSON.stringify(v(r1.result)));

  const r2 = simnet.callPublicFn("vault-v6", "approve-adapter", [adapterCV, Cl.bool(false)], deployer);
  console.log("[fork] approve-adapter ->", JSON.stringify(v(r2.result)));

  const r3 = simnet.callPublicFn("zest-earn-adapter", "set-vault", [Cl.contractPrincipal(deployer, "vault-v6")], deployer);
  console.log("[fork] adapter.set-vault ->", JSON.stringify(v(r3.result)));

  simnet.callPublicFn("zest-earn-adapter", "set-oracle-at", [Cl.uint(0), Cl.principal(oracle1)], deployer);
  simnet.callPublicFn("zest-earn-adapter", "set-oracle-at", [Cl.uint(1), Cl.principal(oracle2)], deployer);
  const a1 = simnet.callPublicFn("zest-earn-adapter", "set-apy", [Cl.uint(400)], oracle1);
  const a2 = simnet.callPublicFn("zest-earn-adapter", "set-apy", [Cl.uint(400)], oracle2);
  console.log("[fork] set-apy x2 ->", JSON.stringify(v(a1.result)), JSON.stringify(v(a2.result)));

  const apy = simnet.callReadOnlyFn("zest-earn-adapter", "get-apy", [], deployer);
  console.log("[fork] adapter.get-apy ->", JSON.stringify(v(apy.result)));
}

describe("Zest mainnet-fork — reproduce the failing deposit", () => {
  it("reads real Zest vault state at the fork height", () => {
    const capSupply = v(simnet.callReadOnlyFn(ZEST, "get-cap-supply", [], deployer).result);
    const assets = v(simnet.callReadOnlyFn(ZEST, "get-assets", [], deployer).result);
    const initialized = v(simnet.callReadOnlyFn(ZEST, "get-pause-states", [], deployer).result);
    console.log("[fork] Zest cap-supply:", capSupply, "assets:", assets, "pause-states:", JSON.stringify(initialized));
    console.log("[fork] HOLDER sBTC balance:", sbtcBalance(HOLDER).toString());
    expect(sbtcBalance(HOLDER)).toBeGreaterThanOrEqual(AMOUNT);
  }, T);

  it("reproduces: vault-v6.deposit -> zest-earn-adapter (as-contract) -> REAL Zest vault", () => {
    setup();

    const holderBefore = sbtcBalance(HOLDER);
    const zestAssetsBefore = zestAssets();
    console.log("[fork] holder sBTC before:", holderBefore.toString());
    console.log("[fork] Zest vault assets before:", zestAssetsBefore.toString());

    const SBTC_CV = Cl.contractPrincipal(SBTC_ADDR, "sbtc-token");
    const adapterCV = Cl.contractPrincipal(deployer, "zest-earn-adapter");

    const dep = simnet.callPublicFn(
      "vault-v6",
      "deposit",
      [SBTC_CV, adapterCV, Cl.uint(AMOUNT)],
      HOLDER
    );

    console.log("[fork] vault-v6.deposit result ->", JSON.stringify(v(dep.result)));
    console.log("[fork] events:", JSON.stringify(dep.events, null, 2));

    const holderAfter = sbtcBalance(HOLDER);
    const zestAssetsAfter = zestAssets();
    const adapterBal = sbtcBalance(adapterPrincipal());

    console.log("[fork] holder sBTC after:", holderAfter.toString(), "  delta:", (holderAfter - holderBefore).toString());
    console.log("[fork] Zest vault assets after:", zestAssetsAfter.toString(), "  delta:", (zestAssetsAfter - zestAssetsBefore).toString());
    console.log("[fork] adapter's own sBTC balance (should be 0 if fully forwarded):", adapterBal.toString());

    // This is the actual question: did the holder's sBTC really decrease by AMOUNT?
    expect(holderBefore - holderAfter).toBe(AMOUNT);
  }, T);
});
