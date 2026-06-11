# SatoshiYields — Mainnet Deploy & Launch Runbook (v6)

Owner-controlled launch of the **two-tile** protocol: **Zest** (sync, lending,
principal-protected) + **Hermetica hBTC** (async, managed strategy, ~8% target).
Contracts are published and initialized through the **Asigna 2-of-3 multi-sig** UI
(https://asigna.io) — no deployer private key ever touches disk. The authoritative
deploy record is `contracts/deployments/v6.mainnet-plan.yaml`.

> The vault is **immutable** once deployed. The one-shot `set-sbtc-token` call
> must register the **real** sBTC token. Registering anything else permanently
> bricks the vault.

## Architecture (v6)

- **vault-v6** — supports SYNC adapters (atomic `deposit`/`withdraw`) and ASYNC
  adapters (`deposit-async` + two-phase `request-withdraw` → `claim-withdraw`, with
  `cancel-withdraw`). All v5 guards retained (reentrancy, TVL cap, one-position,
  timelocked fees, owner allowlist, stale-oracle deposit guard). Rebalance removed.
- **zest-earn-adapter** (SYNC) → Zest Earn `SP1A27KFY...v0-vault-sbtc`. Principal-protected.
- **hermetica-hbtc-adapter** (ASYNC) → Hermetica hBTC `SP1S1HSFH0...vault-hbtc-v1-2`.
  Redemption is funded by a Hermetica manager after a cooldown — disclosed in the UI.

## HARD GATES (must clear before approving adapters / opening deposits)

1. **Independent audit** of vault-v6 (async two-phase withdrawal) + both adapters.
2. **Mainnet-fork validation** of the real Hermetica hBTC deposit→request→fund→claim
   path (the simnet suite uses a pure-accounting shim, see `contracts/tests/_shims`).
3. **Owner = Asigna 2-of-3 multisig** (NOT a single-key EOA) for the deployer,
   `VITE_DEPLOYER_MAINNET`, and the indexer `DEPLOYER_ADDRESS`.

---

## 0. Pre-flight

- [ ] Asigna 2-of-3 multi-sig created; this SP-address is the **deployer/owner**.
- [ ] Two **independent** low-value oracle wallets created (fresh Leather profiles),
      each funded with ~3 STX. Copy each 64-hex private key (NOT mnemonic).
      These keys can only call `set-apy` — they cannot move funds, change fees,
      pause, or transfer ownership.
- [ ] Deployer funded with STX for ~7 contract publishes + ~14 init calls.
- [ ] `clarinet check` clean; `npm test` green in `contracts/`, `indexer/`, `frontend/`.
- [ ] Confirm real mainnet sBTC: `SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token`.

## 1. Publish contracts (Asigna, in order)

Each publish is proposed in Asigna, approved by 2 signers, then broadcast.
Wait for confirmation before the next batch (later contracts reference earlier ones).

1. `sip-010-trait`
2. `yield-source-v2`
3. `yield-source-async-v1`
4. `vault-v6`
5. `zest-earn-adapter`
6. `hermetica-hbtc-adapter`

(See `contracts/deployments/v6.mainnet-plan.yaml`. `mock-sbtc` / the `_shims` are
**not** published — they are simnet-only.)

## 2. Initialize (Asigna contract-calls)

Run in this order (each is an owner-only call from the multi-sig):

1. `vault-v6.set-sbtc-token(SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token)`
   — **one-shot, irreversible. Triple-check the principal.**
2. `vault-v6.approve-adapter(<deployer>.zest-earn-adapter, false)` (sync)
3. `vault-v6.approve-adapter(<deployer>.hermetica-hbtc-adapter, true)` (async)
4. `<adapter>.set-vault(<deployer>.vault-v6)` for both adapters
5. `<adapter>.set-oracle-at(u0, <oracle-1 SP-address>)` for both adapters
6. `<adapter>.set-oracle-at(u1, <oracle-2 SP-address>)` for both adapters
7. (optional) `vault-v6.set-tvl-cap(uXXXXXXXX)` — default launch cap is `u50000000`
   (~0.5 sBTC).

## 3. Bring up the indexer (Render, always-on)

- Plan **starter** (not free — free sleeps and the oracle push stops). One instance.
- Env (see `indexer/.env.example`): `STACKS_NETWORK=mainnet`,
  `STACKS_API_URL=https://api.hiro.so`, `DEPLOYER_ADDRESS=<multisig>`,
  `CORS_ALLOWED_ORIGINS=https://<your-domain>`, `ORACLE_PRIVATE_KEY=<oracle-1>`,
  `ORACLE_PRIVATE_KEY_2=<oracle-2>`. (Mainnet boot hard-fails without both keys.)
- The pusher runs every 30 min; the on-chain stale window is ~5.5h, so APY stays fresh.

## 4. Verify on-chain (read-only) before opening the UI

- [ ] `vault-v6.get-sbtc-token` == the real sBTC principal.
- [ ] `vault-v6.is-adapter-approved(<each adapter>)` == true; `is-adapter-async` == false for
      zest-earn-adapter, true for hermetica-hbtc-adapter.
- [ ] `<adapter>.get-oracle(u0)` and `get-oracle(u1)` == your two oracle addresses.
- [ ] After the first oracle cycle: `<adapter>.get-apy` returns `(ok ...)` (not stale) on both.
- [ ] `GET /api/health` shows `oracle.mode: "dual"` and a recent `lastCycleAgeSeconds`.
- [ ] `GET /api/yields` returns live Zest APY + hBTC (~8% reference) + real TVLs.

## 5. Deploy the frontend (Vercel)

- Env: `VITE_NETWORK=mainnet`, `VITE_DEPLOYER_MAINNET=<multisig SP-address>`,
  `VITE_INDEXER_URL=https://<indexer-domain>`. The build hard-fails otherwise.

## 6. Low-funds smoke test (do this first, with your own wallet)

1. Deposit a tiny amount (e.g. 0.0001 sBTC) into one adapter.
2. Confirm the position shows in Portfolio.
3. Rebalance to another adapter.
4. Withdraw. **Verify on the Explorer that you received your full principal back.**
5. Confirm the deposit button disables if an adapter ever shows `STALE`.

## 7. Open the beta

- Keep the TVL cap in place; raise gradually via `set-tvl-cap` after clean operation.
- Emergency controls (owner / multi-sig), withdrawals always stay open:
  - `vault-v5.set-global-paused(true)` — halt all new deposits/rebalances.
  - `vault-v5.set-adapter-paused(<adapter>, true)` — halt one protocol.
- Monitor `/api/health` oracle push age; alert if `lastCycleAgeSeconds` exceeds ~2h.

## Rollback / incident

- Pause (global or per-adapter). Withdrawals remain open by design.
- If an oracle key is suspected compromised: it can only move the displayed APY
  within bounds; rotate via `set-oracle-at`. User funds are never at risk from it.

---

# Phase 2 — Real revenue integration (Zest Earn)

The four v4 adapters are **principal-protected stubs** (hold sBTC 1:1, return exactly
the principal, zero yield, zero fee). They are safe for launch and satisfy the
M3 transaction-activity path, but generate **no revenue**. `zest-earn-adapter`
is the upgrade that produces real yield + real protocol fees.

## What it does

- Routes deposited sBTC into the **Zest Earn sBTC vault** (lending/supply — no
  impermanent loss, so principal stays protected), tracks each user's vault shares.
- On withdraw, redeems shares for sBTC (principal + accrued Zest yield) and hands
  it to `vault-v5`, which pays the user principal + (1 - fee) × yield and books the
  rest as protocol revenue (default **5% of yield**, max 10%, timelocked).
- Revenue scales with TVL: ~5% of ~4% APY ≈ **~0.2% of TVL / yr** to the
  fee-collector. Real, but only material at higher TVL — near term, TVL/usage is
  the milestone prize; revenue follows.

Proven end-to-end in `contracts/tests/zest-earn-adapter.test.ts` (deposit routes to
Zest, yield accrues, withdraw returns principal + 95% of yield, vault books 5%,
principal-protected at 0 yield, owner collects the fee).

## ⚠️ Audit-pending — mock → real cutover (DO NOT ship real funds before this)

The adapter currently calls the local `.mock-zest-vault` so the path is testable.
Before any real sBTC flows through it:

1. **Verify the real Zest Earn sBTC vault** on mainnet. The lending market is
   `SP2VCQJGH7PHP2DJK7Z0V48AGBHQAW3R3ZW1QF4N.pool-borrow-v2-3` (Aave-v3 style —
   its `withdraw` needs a Pyth `price-feed-bytes` payload + oracle traits, which
   is **not** wrapped here). The simpler **Zest Earn vault** (`vault-sbtc`,
   `deposit(amount,min-out,recipient)` / `redeem(amount,min-out,recipient)`,
   underlying `SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token`) is the
   integration target. Confirm the live mainnet principal + interface on-chain
   (`/v2/contracts/interface/...`) and with the Zest team.
2. Add it as a Clarinet **requirement** (mainnet contract) and update
   `zest-sbtc-vault-trait` if the real signatures differ (e.g. min-out semantics,
   recipient arg). Re-point every `.mock-zest-vault` reference in
   `zest-earn-adapter.clar` at the real principal.
3. **Fork-test** deposit + redeem against mainnet state (`clarinet` mainnet
   execution / simnet with requirements) — confirm shares, slippage, and that
   redeem returns ≥ principal.
4. Complete the **external audit** (Asymmetric Research) of the fund-routing path,
   as promised to the grant committee.
5. Deploy `zest-earn-adapter` via Asigna, `approve-adapter` it on `vault-v5`,
   `set-vault` + register oracles, then activate it across the stack with env
   flags (no code change) — start with the low TVL cap; low-funds smoke test first:

   | Service | Variable | Value |
   |---------|----------|-------|
   | Frontend (Vercel) | `VITE_ZEST_ADAPTER` | `zest-earn-adapter` |
   | Indexer (Render)  | `ZEST_ADAPTER_NAME` | `zest-earn-adapter` |

   Both must match so the adapter that the oracle funds + the API reads is the
   same one the UI deposits into. Until both are set, everything stays on the
   principal-protected `zest-adapter-v4` stub. `vault-v5` rejects any adapter it
   has not `approve-adapter`'d, so a half-applied flag can never route to an
   unapproved contract — it just fails safe.

## Phase 3 — Bitflow / ALEX / Velar real AMM integrations

The three non-Zest slots currently run **principal-protected v4 stubs**
(`bitflow-adapter-v4`, `alex-adapter-v4`, `velar-adapter-v4`). No native sBTC
LP pool exists today on any of these three protocols, so there is nothing safe to
route to. The v4 stubs are the correct adapter for launch.

When a real sBTC pool becomes available on one of these protocols, the upgrade
path is:

### ⚠️ AMM adapters are NOT principal-protected

Unlike Zest lending, an AMM LP position is subject to **impermanent loss**: a
withdrawal can return LESS sBTC than was deposited. The UI must show an explicit
IL warning on every AMM deposit and a global risk banner.

### Per-protocol cutover (each is SEPARATE — do not batch)

For EACH protocol, before real funds:

1. **Verify the real router/pool interface.** Confirm the live mainnet principal +
   functions on-chain (`/v2/contracts/interface/...`) and with the protocol team.
   Single-sided sBTC deposit may not exist — confirm before building.
2. Write `<protocol>-amm-adapter.clar` implementing `yield-source-v2-trait`.
   Add the real pool as a Clarinet `requirement`; fork-test add + remove against
   mainnet state; confirm slippage behavior and that LP accounting matches.
3. **External audit** of the new adapter (separate from the Zest audit).
4. Deploy via Asigna, `approve-adapter` on `vault-v5`, `set-vault` + oracles,
   then activate with env flags (no code change — same mechanism as Zest):

   | Service | Variable | Value |
   |---------|----------|-------|
   | Frontend (Vercel) | `VITE_BITFLOW_ADAPTER` | `bitflow-amm-adapter` |
   | Indexer (Render)  | `BITFLOW_ADAPTER_NAME` | `bitflow-amm-adapter` |

   (Likewise for ALEX/Velar — update both simultaneously so the oracle feeds the
   same adapter the UI deposits into.)

Until activated, each protocol stays on its principal-protected v4 stub.
