# SatoshiYields — Security Model

Non-custodial sBTC vault + adapters on Stacks (Clarity 3). This document states
the threat model, trust boundaries, and the guarantees the system does and does
**not** make. It complements `docs/AUDIT_NOTES.md` (findings + risk assessment).

## Components & trust boundaries

| Component | Trust | Notes |
|-----------|-------|-------|
| `vault-v5` | Immutable, owner-gated admin | Holds no user funds at rest; routes deposits to adapters; returns funds on withdraw. |
| `*-adapter-v4` (×4) | Immutable, vault-only mutations | Each adapter custodies **only its own** sBTC. Isolated per protocol. |
| `sip-010-trait`, `yield-source-v2` | Immutable traits | Interface definitions. |
| sBTC token | External, canonical | `SM3KNVZS30WM7F89SXKVVFY4SN9RMPZZ9FX929CCA.sbtc-token`, pinned one-shot via `set-sbtc-token`. |
| Oracle keys (×2) | Low-value, semi-trusted | Can only call `set-apy` within bounds. Cannot move funds, pause, or change fees. |
| Owner (Asigna 2-of-3 multi-sig) | Trusted, capability-limited | Admin only — see "Owner powers" below. |
| Indexer | Off-chain, untrusted by the contracts | Reads chain + pushes APY. A compromised indexer cannot move funds. |

## Adapter risk tiers (read this first)

SatoshiYields has three adapter types with **different** risk. The UI labels each
and shows an explicit warning before any non-principal-protected deposit.

| Tier | Adapters | Principal-protected? | Risk |
|------|----------|----------------------|------|
| Stub (launch default) | `*-adapter-v4` | **Yes** | Holds sBTC 1:1, returns exactly principal. No yield, no fee. |
| Lending (Phase 2) | `zest-earn-adapter` | **Yes** | Routes to Zest Earn (supply/lending). No impermanent loss. Audit-pending. |
| AMM (Phase 3) | `bitflow-amm-adapter`, `alex-amm-adapter`, `velar-amm-adapter` | **NO** | Routes to AMM LP pools. **Impermanent loss: withdrawal can return less sBTC than deposited.** Audit-pending. |

Phase 2/3 adapters are activated per-protocol by env flag only after on-chain
interface verification + fork-test + external audit (see `MAINNET-DEPLOY.md`).
Default deployment uses the principal-protected stubs.

## Fund-safety guarantees

- **Principal-protected (stub + lending tiers).** These adapters never return less
  than the deposited principal — stubs hold sBTC 1:1; Zest lending has no
  impermanent loss. Verified by `contracts/tests/vault-v5.test.ts` and
  `zest-earn-adapter.test.ts`. **AMM adapters are explicitly NOT covered by this
  guarantee** (impermanent loss — see `amm-adapter.test.ts` for the loss case).
- **Fees never deepen a loss.** The vault charges its performance fee on positive
  yield only (`gross > principal`); an AMM loss produces a zero fee.
- **Withdrawals are always open.** `withdraw` never checks global-pause,
  adapter-pause, or oracle freshness. Pausing only blocks *new* deposits/rebalances.
- **Per-protocol isolation.** Each adapter is a separate contract holding only its
  own balance/LP; a bug, pause, IL, or exploit in one adapter cannot touch another's funds.
- **External-protocol exposure is opt-in + audit-gated.** Stub adapters route no
  funds externally. The Zest and AMM adapters DO route into external protocols and
  are audit-pending; each is enabled only after its own verification + audit.
- **Reentrancy guard.** `deposit` / `withdraw` / `rebalance` acquire a
  non-reentrant lock; Clarity reverts all state on error, auto-releasing it.
- **Deposit post-condition.** The frontend attaches an exact-amount sBTC
  post-condition (`willSendEq`) in deny mode on deposit, so a user can never send
  more sBTC than intended. Withdraw uses allow mode safely (the user sends nothing;
  the contract returns funds to them).
- **Token pinning.** `set-sbtc-token` is one-shot; every deposit/withdraw validates
  the supplied token against the pinned principal (`err-bad-token`).

## Owner (multi-sig) powers — and limits

The owner **can**: pause globally / per-adapter; approve/revoke adapters; set the
TVL cap (cannot set below current deposits); schedule fee-bps and fee-collector
changes (**timelocked ~1 day**, fee ≤ 10% of yield only); collect accrued fees;
register oracle keys.

The owner **cannot**: withdraw or seize user principal; change the sBTC token after
init; bypass the fee timelock; raise the fee above 10%; take any fee from principal.

## Oracle model

APY is **display-only** and never affects payouts. Two independent oracle keys push
`set-apy`; the adapter commits a value only on **2-of-3 consensus** (two fresh
reports within 10%). A push beyond ±50% of the current value is rejected
(`err-deviation`). A value older than **2160 blocks (~5.5h)** is `STALE`, which
blocks *new deposits* to that adapter (funds remain safe and withdrawable). The
indexer pushes every 30 min, holding last-known-good on a data outage, so the
on-chain APY stays fresh while the (always-on) indexer runs.

## Deposit caps (staged launch)

Launch TVL cap defaults to `u50000000` (~0.5 sBTC, ~$25–50K). Owner-adjustable via
`set-tvl-cap` as the protocol earns mainnet history. Per-user minimum deposit is
`u1000` sats; one active position per user.

## Out of scope / known limitations

- **Impermanent loss (AMM tier).** Bitflow/ALEX/Velar route into AMM LP positions;
  a withdrawal can return less sBTC than deposited even with no bug or exploit.
  This is inherent to AMMs, not a defect. Surfaced via per-deposit UI warning + a
  global risk banner. Users should only deposit what they can afford to lose.
- Default-launch stub adapters do **not** generate external yield; displayed APYs
  are live **market reference rates**. The UI shows realized earnings honestly.
- A compromised oracle key can nudge a *displayed* APY within bounds (never move
  funds); rotate via `set-oracle-at`.
- Zest + AMM adapters are **audit-pending**; external audit (e.g., Asymmetric
  Research) is required per-adapter before real funds are routed through it.

## Reporting

Report security issues privately to the maintainer before public disclosure.
