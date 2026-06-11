# SatoshiYields

Non-custodial **sBTC yield optimizer** on [Stacks](https://www.stacks.co/) (Bitcoin L2).
Deposit sBTC into one vault; it routes your funds into vetted yield sources and returns
principal + yield on withdrawal. Funds are never custodial — they live in the underlying
protocols' contracts, not ours. A performance fee is taken on **yield only**.

> **Status:** pre-launch (Preparing Launch). Nothing is deployed to mainnet yet. The
> contracts are simnet- and mainnet-fork-tested and have had two internal security
> reviews, but a **professional third-party audit** and a **full node-fork redeem run**
> are required before real funds. See [Security](#security).

## Yield tiles

| Tile | Type | Risk | Notes |
|---|---|---|---|
| **Zest** | Lending (sync) | Principal-protected | Routes sBTC into Zest Earn; withdraw any time. |
| **Hermetica hBTC** | Strategy (async) | **Not** principal-guaranteed | ~8% target. Two-phase withdrawal (request → Hermetica funds after a ~3-day cooldown → claim), small exit fee, subject to vault capacity. |
| *Dual Stacking (PoX)* | — | — | Coming soon. |

## Architecture

A single **vault** holds no pooled capital itself — on deposit it forwards sBTC straight
into the chosen **adapter**. The vault enforces one position per user, a TVL cap, a
reentrancy guard, timelocked fee changes, and an owner-controlled allowlist of approved
adapters. It supports two adapter kinds behind a common trait:

- **Sync** (`yield-source-v2`) — atomic `deposit` / `withdraw` (Zest).
- **Async** (`yield-source-async-v1`) — atomic deposit, but a two-phase
  `request-withdraw` → `claim-withdraw` (with `cancel-withdraw` as an escape hatch),
  for yield sources whose redemption isn't instant (Hermetica hBTC).

Each adapter carries a 3-of-N oracle APY feed used only to gate deposits on freshness.

```
user ──▶ vault-v6 ──▶ zest-earn-adapter ──▶ Zest Earn vault        (sync)
                  └──▶ hermetica-hbtc-adapter ──▶ Hermetica hBTC   (async)
```

**Key contracts** (`contracts/contracts/`):
- `vault-v6.clar` — deposits, sync + two-phase async withdrawals, fee-on-yield, adapter allowlist
- `adapters/zest-earn-adapter.clar` — Zest Earn (sync, principal-protected)
- `adapters/hermetica-hbtc-adapter.clar` — Hermetica hBTC (async)
- `traits/{sip-010-trait,yield-source-v2,yield-source-async-v1}.clar`

## Repository layout

```
contracts/   Clarity smart contracts + Clarinet/Vitest tests
  fork-test/ standalone mainnet-fork harness (real Hermetica contracts)
indexer/     Node/TS service: aggregates APY/TVL, pushes oracle APY on-chain
frontend/    React + Vite dApp
docs/        SECURITY.md, AUDIT_NOTES.md
MAINNET-DEPLOY.md   Asigna deploy runbook
```

## Getting started

Prerequisites: **Node 22**, **Clarinet 3.x** (`brew install clarinet`).

```bash
# Contracts
cd contracts && npm install && clarinet check && npm test     # 24 tests

# Indexer
cd indexer && npm install && npm test                          # 17 tests

# Frontend
cd frontend && npm install && npm test && npm run build        # 8 tests

# Mainnet-fork validation (real Hermetica contracts; needs network)
cd contracts/fork-test && cp settings/Devnet.toml.example settings/Devnet.toml && npx vitest run
```

Copy each `.env.example` to the appropriate local env file before running the
indexer/frontend (`frontend/.env.test` ships with public test values).

## Security

- **Two internal reviews** (CSO-style audit + an independent cold review). The cold pass
  found a **critical** issue (`claim-withdraw` could sweep co-mingled funds in the pooled
  async adapter) — **fixed** (it now forwards only the exact redeemed amount) with a
  regression test.
- **Mainnet-fork tested** against the live Hermetica contracts (`contracts/fork-test/`):
  real deposit, request-redeem, and manager-funded claim accounting validated.
- **Required before mainnet (hard gates):** independent professional audit · full
  real-ledger redeem on a Stacks-node fork · contract owner = an Asigna 2-of-3 multisig.

**Risk note:** Zest is principal-protected lending; **Hermetica hBTC is a managed strategy
— not principal-guaranteed** (exit fee, ~3-day async withdrawal, and a liveness/trust
dependency on Hermetica funding redemptions). See `docs/SECURITY.md`.

## Deployment

Mainnet contracts are published and initialized via the **Asigna 2-of-3 multisig** UI per
`contracts/deployments/v6.mainnet-plan.yaml`. Step-by-step runbook in `MAINNET-DEPLOY.md`.

## License

Proprietary — all rights reserved (pending license decision).
