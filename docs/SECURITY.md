# SatoshiYields — Security Model

Non-custodial sBTC vault + adapters on Stacks (Clarity 3). This document states the
threat model, trust boundaries, and the guarantees the system does and does **not**
make. It complements `docs/AUDIT_NOTES.md` (findings + risk assessment).

## Components & trust boundaries

| Component | Trust | Notes |
|-----------|-------|-------|
| `vault-v6` | Immutable, owner-gated admin | Holds no user funds at rest; forwards deposits to the adapter; returns funds on withdraw. Supports sync + async adapters. |
| `zest-earn-adapter` | Immutable, vault-only mutations | LIVE. Routes to Zest Earn. Custodies only its own sBTC/shares. |
| `hermetica-hbtc-adapter` | Immutable, vault-only mutations | Built + tested, **held as coming-soon**. Async two-phase redemption. Not deployed at launch. |
| `sip-010-trait`, `yield-source-v2`, `yield-source-async-v1` | Immutable traits | Interface definitions. |
| sBTC token | External, canonical | `SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token`, pinned one-shot via `set-sbtc-token`. |
| Oracle keys (×2) | Low-value, semi-trusted | Can only call `set-apy` within bounds. Cannot move funds, pause, or change fees. |
| Owner (Asigna 2-of-3 multi-sig) | Trusted, capability-limited | Admin only — see "Owner powers" below. |
| Indexer | Off-chain, untrusted by the contracts | Reads chain + pushes APY. A compromised indexer cannot move funds. |

## Adapter risk tiers (read this first)

vault-v6 supports two adapter kinds with **different** risk. The UI labels each and
shows an explicit warning before any non-principal-protected deposit.

| Tier | Adapter | Principal-protected? | Risk |
|------|---------|----------------------|------|
| Lending (sync, LIVE) | `zest-earn-adapter` | **Yes** | Routes to Zest Earn (supply/lending). No impermanent loss. Atomic deposit/withdraw. |
| Strategy (async, COMING SOON) | `hermetica-hbtc-adapter` | **NO** | Managed BTC strategy (~8% target). Small exit fee + a liveness dependency on Hermetica funding redemptions after a cooldown. Two-phase withdrawal with cancel. |

The async adapter is enabled only after its own gates clear (partner SLA + adapter
audit + full-ledger redeem; see `MAINNET-DEPLOY.md`). Launch ships Zest-only.

## Fund-safety guarantees

- **Non-custodial.** On deposit, sBTC forwards straight `user → adapter → underlying
  protocol`. vault-v6 never holds user principal — only accrued performance fees.
- **Principal-protected (Zest lending).** The Zest adapter never returns less than the
  deposited principal — lending has no impermanent loss. Verified by
  `contracts/tests/zest-earn-adapter.test.ts` (incl. the zero-yield principal case).
  **hBTC is explicitly NOT covered by this guarantee** (managed strategy + exit fee).
- **Fees never deepen a loss.** The vault charges its performance fee on positive yield
  only (`gross > principal`); zero yield → zero fee.
- **Withdrawals are always open.** `withdraw` / `claim-withdraw` never check global-pause,
  adapter-pause, adapter-approval, or oracle freshness. Pausing only blocks *new* deposits.
- **Per-adapter isolation.** Each adapter is a separate contract holding only its own
  balance/shares; a bug, pause, or exploit in one cannot touch another's funds.
- **Async pooled-fund safety (C1 fix).** `claim-withdraw` forwards **exactly** the redeem
  return value for that claim — never the adapter's raw balance — so concurrent
  redemptions in a pooled async adapter cannot co-mingle or let one user sweep another's
  funds. Regression-tested with a 2-user no-sweep test.
- **Reentrancy guard.** `deposit` / `withdraw` / `deposit-async` / `request-withdraw` /
  `claim-withdraw` / `cancel-withdraw` acquire a non-reentrant lock; Clarity reverts all
  state on error, auto-releasing it.
- **Slippage guard.** The Zest adapter applies a 1% `min-out` on both deposit and redeem.
- **Deposit post-condition.** The frontend attaches an exact-amount sBTC post-condition
  (`willSendEq`, deny mode) on deposit, so a user can never send more sBTC than intended.
- **Token pinning.** `set-sbtc-token` is one-shot; every deposit/withdraw validates the
  supplied token against the pinned principal (`err-bad-token`).

## Owner (multi-sig) powers — and limits

The owner **can**: pause globally / per-adapter; approve/revoke adapters; set the TVL cap
(cannot set below current deposits); schedule fee-bps and fee-collector changes
(**timelocked ~1 day**, fee ≤ 10% of yield only); collect accrued fees; register oracle
keys; **force-exit a user's position (`admin-exit`)** — see below.

The owner **cannot**: redirect, seize, or take user funds; change the sBTC token after init;
bypass the fee timelock; raise the fee above 10%; take any fee from principal.

### Admin-exit (forced migration) — bounded by design

`admin-exit(user, adapter, sbtc)` lets the owner withdraw any user's (sync) position on
demand — used to evacuate every user off this vault onto an upgraded one after a fix,
with no user action and no UI. The critical safety property: **the proceeds are always
sent to `user` (the position owner), never to an owner-chosen address.** The owner
controls only *when* funds exit, never *where* they go — so even a fully compromised
owner key can only return funds to their rightful owner; it can never redirect or seize
them. The non-custodial guarantee is preserved. (Async positions are excluded: shares are
mid-redemption with the external protocol and must be finished by the user.)

## Oracle model

APY is **display + deposit-gate only** and never affects payouts. The Zest APY the oracle
pushes is the **realized supply rate of the exact vault we deposit into** — derived from
`v0-vault-sbtc`'s on-chain share-price (`convert-to-assets`) growth over a ≥24h trailing
window (`indexer/src/share-price.ts`), not a third-party feed. Two independent oracle keys
push `set-apy`; the adapter commits a value only on **2-of-3 consensus** (two fresh reports
within 10%). A push beyond ±50% of the current value is rejected (`err-deviation`), and the
value is capped at **6000 bps (60%)**. A value older than **2160 blocks** is `STALE`, which
blocks *new deposits* to that adapter (funds remain safe and withdrawable). The indexer
pushes every 30 min — well inside the stale window — holding last-known-good on a data
outage, so the on-chain APY stays fresh while the (always-on) indexer runs.

## Deposit caps (staged launch)

Launch TVL cap defaults to `u50000000` (~0.5 sBTC). Owner-adjustable via `set-tvl-cap` as
the protocol earns mainnet history. Per-user minimum deposit is `u1000` sats; one active
position per user.

## Out of scope / known limitations

- **hBTC managed-strategy risk (when enabled).** hBTC is not principal-guaranteed: a small
  exit fee applies and redemption is funded by Hermetica after a cooldown — sBTC liquidity is
  delayed and depends on Hermetica funding. `cancel-withdraw` returns the position before
  funding, so funds are never *lost*, but liquidity is trust-dependent. Surfaced via a
  per-deposit UI disclosure. Held as coming-soon until its gates clear.
- A compromised oracle key can nudge a *displayed* APY within bounds (never move funds);
  rotate via `set-oracle-at`.
- External-protocol exposure is audit-gated: each adapter that routes into an external
  protocol requires its own interface verification + fork-test + external audit before real
  funds flow.

## Reporting

Report security issues privately to the maintainer before public disclosure.
