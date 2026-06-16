# SatoshiYields — Internal Audit Notes

Internal pre-mainnet review of the `Mainnet-beta` bundle (**vault-v6** + **zest-earn-adapter**
live; **hermetica-hbtc-adapter** built and held as coming-soon). Pairs with `docs/SECURITY.md`.
An **external third-party audit is the remaining hard gate** before real funds — this internal
review is audit-prep, not a substitute.

## Architecture (v6)

Two-tile design: **Zest** (sync lending, principal-protected) ships live; **Hermetica hBTC**
(async managed strategy, ~8% target, NOT principal-guaranteed) and **Dual Stacking (PoX)** are
coming-soon tiles. The vault is **vault-v6**: a sync path (`deposit`/`withdraw`) plus an async
two-phase path (`deposit-async` → `request-withdraw` → `claim-withdraw`, with `cancel-withdraw`).
Rebalance and the former ALEX/Velar/Bitflow AMM adapters + v4 stubs were removed in the v6
restructure.

## v6 findings & resolutions

| # | Sev | Finding | Resolution |
|---|-----|---------|------------|
| C1 | **Critical** | hBTC async `claim-withdraw` forwarded the adapter's **full** sBTC balance. Since the adapter is pooled and `redeem` is permissionless, two users' redeemed sBTC co-mingle → first claimant sweeps both, second stranded. | Forward **exactly** `redeem`'s return value for that claim (removed the balance read). Added a 2-user no-sweep regression test. |
| V6-1 | High | hBTC blacklist strands **both** `redeem` AND `cancel` — "cancel always works" only while not blacklisted. | Documented as a partner-trust limitation; UI discloses it; **hBTC held as coming-soon** pending a written Hermetica blacklist policy. |
| V6-2 | Med | hBTC deposit-cap blocks deposits when full (`u103001`). | `useHbtcCapacity` reads the live cap; the deposit modal blocks + explains before the tx reverts. (Moot at launch — hBTC is coming-soon.) |
| V6-3 | Med | 3-day async cooldown must be disclosed concretely, not hand-waved. | Stated in the deposit disclosure copy (`constants/protocols.ts`). |

## Historical fixes (pre-v6 review, still in force)

Verified still-correct against vault-v6 (the guards carried forward unchanged):

| # | Sev | Finding | Resolution |
|---|-----|---------|------------|
| 1 | Critical | A deploy script registered `mock-sbtc` in the one-shot `set-sbtc-token` — on mainnet this permanently bricks the vault. | Mainnet init runs via Asigna with the **real** sBTC principal (`SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token`); deploy scripts removed. |
| 2 | Critical | Stale-yields window was shorter than the push interval → APY went stale every cycle and blocked deposits. | Stale window set to **2160 blocks**; indexer pushes every **30 min** and holds last-known-good on outage; indexer on an always-on plan. |
| 3 | High | Displayed APY fell back to hardcoded constants. | Live data: Zest via DefiLlama pool; TVL via DefiLlama. No-live-feed adapters are shown as labeled **reference** rates (`is_live_integration=false`). |
| 4 | High | Mainnet build showed "TESTNET · SIMULATED" badges / testnet links. | All chain references derive from `networkName`; copy reframed to live mainnet. |
| 5 | High | Misleading UX (fake sparkline, "earning X%" while realized yield 0). | Removed; realized earnings shown honestly; principal-protected disclosure in the deposit flow. |
| 6 | Med | TVL cap defaulted too high. | Default `u50000000` (~0.5 sBTC); owner-raisable via `set-tvl-cap`. |
| 7 | Med | Indexer on a sleeping free tier. | Always-on `starter`, single instance; `/api/health` surfaces oracle mode + last-push age. |
| 9 | Med | `APY-CAP` was 1000%. | Lowered to **6000 bps (60%)**; off-chain fetchers also clamp to 60%. |

### Verified-correct (defense reviewed, no change required)
- Non-custodial: funds forward straight to the adapter; the vault only ever holds accrued fees.
- One-shot `set-sbtc-token` with per-call token validation (`err-bad-token`).
- Withdraw / claim-withdraw never gated by pause/approval/oracle — **withdrawals always open**.
- Fee charged on **yield only**, with an overflow guard; never on principal.
- Per-adapter fund isolation; adapter mutations gated to the authorized vault.
- Fee-bps / fee-collector changes timelocked (~1 day); fee ≤ 10%.
- Reentrancy lock on all six funds-touching entry points.

## Formal risk assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Smart-contract bug in vault/adapter logic | Low | High | Internal review (2 passes; C1 found+fixed); 44 unit tests (24 contract + 12 indexer + 8 frontend); immutable, minimal surface; deposit cap; **external audit required before launch**. |
| Owner key compromise | Low | Medium | Asigna 2-of-3 multi-sig; owner cannot seize principal or force-move positions; fee changes timelocked. |
| Oracle key compromise | Low | Low | Keys only move a display value within ±50% / 2-of-3; rotatable; no fund access. |
| Indexer downtime > stale window | Low | Low | Always-on plan + health monitoring; only blocks *new* deposits; withdrawals unaffected. |
| Upstream protocol exploit (Zest) | Low | Medium | Per-adapter emergency pause; non-custodial vault; principal-protected lending (no IL). |
| hBTC partner liveness (when enabled) | Med | Med | Held coming-soon pending written SLA + blacklist policy; `cancel-withdraw` fallback; UI disclosure. |

## Migration & upgrade model

The vault is immutable. A fix = deploy a new contract; existing users are migrated off the
old one in one of two ways, **both of which keep funds non-custodial**:

- **Admin-driven (`admin-exit`).** The owner force-exits each user's (sync) position on
  demand — proceeds always go to the **position owner's own wallet**, never an owner-chosen
  address. The owner controls *when*, never *where*. This evacuates the old vault as a pure
  admin operation (no user action, no UI), at any scale, and a compromised owner key still
  cannot redirect or seize funds. Users then re-deposit into the new vault (a normal
  deposit). Async positions are excluded (mid-redemption) — let pending claims settle, then
  exit the now-active ones.
- **User-driven.** Withdrawals never freeze, so any user can always withdraw → re-deposit
  themselves.

For an **adapter** fix the vault is untouched: deploy the new adapter, `approve-adapter` it,
`set-adapter-paused` the old one, re-point the env flags; users (or `admin-exit`) move over.
See `MAINNET-DEPLOY.md` → "Rollback / incident".

> **Deliberately NOT built:** an admin function that deposits user funds into an
> owner-specified destination contract. That is a critical rug vector (a compromised owner
> picks a malicious destination and drains everyone). `admin-exit` gives the same
> operational power — bulk evacuation — without the destination ever being attacker-controllable.

## Pre-launch gates (must clear)

1. **External third-party audit** of `vault-v6` + `zest-earn-adapter` + traits.
2. **Owner = Asigna 2-of-3 multisig** for deployer, `VITE_DEPLOYER_MAINNET`, indexer
   `DEPLOYER_ADDRESS`.
3. Audit confirms the Zest `redeem(shares, min-out, recipient)` integration assumption
   (pays the vault directly, returns exact gross) on a mainnet fork.
