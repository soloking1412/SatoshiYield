# SatoshiYields — Internal Audit Notes

> **ARCHITECTURE UPDATE (v6, 2026-06).** Restructured to two live tiles: **Zest**
> (sync lending, principal-protected) and **Hermetica hBTC** (async managed strategy,
> ~8% target). ALEX/Velar/Bitflow adapters removed. The vault is now **vault-v6**,
> adding an ASYNC two-phase withdrawal (`request-withdraw` → Hermetica funds the claim
> after a cooldown → `claim-withdraw`, with `cancel-withdraw` as an escape hatch)
> alongside the sync path; rebalance removed. hBTC is NOT principal-guaranteed (small
> exit fee + a liveness dependency on Hermetica funding redemptions) — disclosed in
> the UI. New code (vault-v6 + hermetica-hbtc-adapter) MUST be audited and fork-tested
> against the real Hermetica contracts before approval. See
> `contracts/deployments/v6.mainnet-plan.yaml`. Notes below predate this change.

Internal pre-mainnet review of the `Mainnet-beta` bundle (vault-v5 + four v4
adapters + two traits). Pairs with `docs/SECURITY.md`. An external audit
(e.g. Asymmetric Research) is planned before/shortly after mainnet.

> **Revenue path (Phase 2):** `zest-earn-adapter` adds real yield + protocol fees
> by routing sBTC into the Zest Earn lending vault (principal-protected, no IL). It
> is **audit-pending**: it compiles and is fully unit-tested against a yielding mock
> (`mock-zest-vault`), but must be repointed at the verified real Zest principal and
> fork-tested + externally audited before real funds flow. Launch ships on the
> principal-protected v4 stubs; the revenue adapter is the gated upgrade. See
> `MAINNET-DEPLOY.md` "Phase 2".
>
> **AMM path (Phase 3):** `bitflow-amm-adapter` / `alex-amm-adapter` /
> `velar-amm-adapter` route sBTC into AMM pools via `amm-pool-trait`. They are
> **audit-pending AND NOT principal-protected** — AMM positions carry impermanent
> loss, so a withdrawal can return less sBTC than deposited. Unit-tested against
> `mock-amm-pool` including an explicit IL case (user receives < principal; vault
> charges zero fee on a loss). The UI shows an IL warning on every AMM deposit plus
> a global risk banner. Each protocol needs its own interface verification +
> fork-test + external audit before activation. See `MAINNET-DEPLOY.md` "Phase 3".

## Findings & resolutions

| # | Sev | Finding | Resolution |
|---|-----|---------|------------|
| 1 | Critical | `scripts/init-v5.js` registered `mock-sbtc` in the one-shot `set-sbtc-token` — on mainnet this permanently bricks the vault. | Script now binds the **real** sBTC on mainnet and **hard-refuses** any `mock` token when `NETWORK=mainnet`. Mainnet init runs via Asigna with the real principal (see `MAINNET-DEPLOY.md`). |
| 2 | Critical | Stale-yields outage: 720-block window (~1.8h) was **shorter** than the 2h push interval → APY went stale every cycle and blocked deposits. | Stale window raised to **2160 blocks (~5.5h)**; indexer pushes every **30 min** and holds last-known-good on outage; indexer moved to an always-on plan. |
| 3 | High | Displayed APY was not live — all native endpoints were dead, so values fell back to hardcoded constants. | Rewrote fetchers to pull **live** data: ALEX (`api.alexgo.io`), Zest (DefiLlama pool), TVL for all four via DefiLlama. Bitflow/Velar have no live APY source today → shown as labeled **reference** rates. |
| 4 | High | Mainnet build showed "TESTNET · SIMULATED" badges and testnet explorer links. | All chain references now derive from `networkName`; copy reframed to live mainnet. |
| 5 | High | Misleading UX: fabricated "7D APY" sparkline, "Earning X%", "Estimated yearly yield" while realized yield is 0. | Removed the fake sparkline; realized earnings shown as 0; APY relabeled as **market rate**; principal-protected disclosure added to the deposit flow. |
| 6 | Med | Launch TVL cap defaulted to 1.5 sBTC (~$125K), over the promised $25–50K. | Default lowered to `u50000000` (~0.5 sBTC); owner-raisable via `set-tvl-cap`. |
| 7 | Med | Indexer on Render free tier (sleeps) with no external cron → unreliable pushes. | Switched to always-on `starter` plan, single instance (single-writer); `/api/health` surfaces oracle mode + last-push age. |
| 8 | Med | `is_live_integration` / `isLive` hardcoded inconsistently. | Now derived per-fetch from whether a live APY was actually obtained; static `isLive` removed from the frontend. |
| 9 | Med | `APY-CAP` was 100000 bps (1000%). | Lowered to **6000 bps (60%)**; off-chain fetchers also clamp to 60%. |
| 10 | Low | Missing `docs/SECURITY.md` / `docs/AUDIT_NOTES.md`; no HTTP security headers; thin tests; corrupted `index.html`. | Docs added; CSP + X-Frame-Options/HSTS/etc. added to `vercel.json`; contract tests expanded to 34 and indexer to 24; `index.html` rebuilt. |

### Verified-correct (defense reviewed, no change required)
- One-shot `set-sbtc-token` with per-call token validation (`err-bad-token`).
- Withdraw never gated by pause/global-pause/oracle (withdrawals always open).
- Fee charged on **yield only**, with an overflow guard; never on principal.
- Per-adapter fund isolation; adapter mutations gated to the authorized vault.
- Fee-bps / fee-collector changes timelocked (~1 day); fee ≤ 10%.

## Formal risk assessment

(Replaces the application's "None known" placeholder.)

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Smart-contract bug in vault/adapter logic | Low | High | Internal audit; 71 unit tests (34 contract + 24 indexer + 13 frontend); immutable, minimal surface; deposit cap; external audit planned. |
| Owner key compromise | Low | Medium | Asigna 2-of-3 multi-sig; owner cannot seize principal; fee changes timelocked. |
| Oracle key compromise | Low | Low | Keys only move a display value within ±50%/2-of-3; rotatable; no fund access. |
| Indexer downtime > stale window | Low | Low | Always-on plan + health monitoring; only blocks *new* deposits; withdrawals unaffected. |
| Upstream protocol exploit (Bitflow/ALEX/Zest/Velar) | Med | None (v1) | v1 holds no funds in those protocols; per-adapter emergency pause; live routing deferred to a post-audit phase. |
| User confusion about yield | Med | Low | Honest UI: market-reference labeling, realized-earnings display, principal-protected disclosures. |
| Low early TVL reduces optimizer value | Med | Low | Standalone live dashboard utility; deposit/rebalance flows; staged cap. |

## Grant committee questions — mapped to code

1. **External audit?** Yes — Asymmetric Research (or another Stacks-familiar
   auditor) before/shortly after mainnet. This internal review is audit-prep.
2. **Deposit caps?** Yes — `vault-v5` `tvl-cap` default `u50000000` (~0.5 sBTC),
   owner-adjustable via `set-tvl-cap`; per-user min `u1000`.
3. **Rebalancing in v1?** Fully manual, user-triggered, one transaction
   (`vault-v5.rebalance`); no keepers/automation.
4. **Vault architecture / isolation?** One router vault + **separate** per-protocol
   adapter contracts; each adapter holds only its own funds (see SECURITY.md).
5. **Upstream protocol risk?** v1 holds no funds in upstream protocols; deposits
   are gated by per-adapter pause + oracle freshness; owner has per-adapter
   emergency pause; **withdrawals always remain open**.
6. **Known risks?** See the formal risk assessment above (the prior "None known"
   was an erroneous placeholder).
