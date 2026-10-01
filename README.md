# SatoshiYields

> **2026-10-01 rebuild candidate:** see [the rebuild plan](docs/REBUILD-PLAN.md), [validation summary](docs/validation/REBUILD-VALIDATION.md), [security findings](contracts/reports/SECURITY-REVIEW.md), and [testnet evidence](docs/validation/testnet-v7.json). V7 is a separate testnet candidate; new vault mainnet deposits are disabled in the rebuilt frontend. Direct Stacks routes and funded protocol fork proofs are implemented; external Bitcoin execution, public economics checks, and an independent audit remain release gates.

An **sBTC yield protocol** on [Stacks](https://www.stacks.co/), being rebuilt with
isolated strategy accounting, bounded wallet transactions, and explicit custody and
withdrawal terms. Returns and principal depend on the underlying strategy. A performance
fee applies to realized profit; neither principal nor yield is guaranteed.

The immutable `vault-v6` is already deployed on mainnet. The new `vault-v7` and two
mock adapters are deployed on testnet; public sync/async deposit and withdrawal lifecycles passed. The fee-change test is waiting for burn block 22731.
This branch does not update the live website, migrate balances, or upgrade v6.
See the [pinned mainnet snapshot](docs/validation/mainnet-snapshot.json).

## Yield tiles

| Tile | Type | Risk | Notes |
|---|---|---|---|
| **Zest** | Lending (sync) | Contract, liquidity, bad-debt and asset risks | Legacy adapter deployed and approved; APY was stale at the inspected block. Current direct lending route has funded real-state fork validation; legacy and new vault routes are separate. |
| **Hermetica hBTC** | Strategy (async) | Strategy, counterparty and redemption risks | Configured mainnet adapter absent and unapproved. Legacy repository adapter has a claim-attribution defect. A separate serialized v7 replacement has local and funded fork recovery tests; upstream public deposits remain disabled. |
| **Stacking DAO stBTC** | Direct sBTC deposit / idle exit / NFT claim | Governance, liquidity, bond and redemption risks | Funded real-source fork validation. New queued exits require the reviewed guard to be deployed; existing claims remain supported. |
| **Native PoX-5 / Babylon / Lombard / Solv** | Distinct native BTC, staking and custody flows | Product-specific | PoX-5 eligibility/recovery planning; Babylon Signet PSBT planning; Lombard sandbox preparation with an upstream authorization blocker; Solv official handoff. No external BTC funded round trip is claimed. See [protocol research](docs/PROTOCOL-RESEARCH.md). |

## Architecture

The legacy vault forwards deposits to an adapter and maintains one position per user.
V7 instead keys positions by user and adapter, with separate caps, 144 Bitcoin-block
admission delays, frozen entry fees, and minimum share/payout limits. It checks actual
redemption balance changes and permits exits while new deposits are paused. Both versions
support two adapter kinds behind traits:

- **Sync** (`yield-source-v2`) — atomic `deposit` / `withdraw` (Zest).
- **Async** (`yield-source-async-v1`) — atomic deposit, but a two-phase
  `request-withdraw` → `claim-withdraw` (with `cancel-withdraw` as an escape hatch),
  for yield sources whose redemption isn't instant (Hermetica hBTC).

Production adapters have additional protocol and oracle assumptions; the public testnet
fixtures establish only vault mechanics and do not earn real yield.

```
mainnet: user ──▶ vault-v6 ──▶ zest-earn-adapter ──▶ legacy Zest Earn
testnet: user ──▶ vault-v7 ──▶ mock-sync-v7 / mock-async-v7
```

**Key contracts** (`contracts/contracts/`):
- `vault-v6.clar` — deposits, sync + two-phase async withdrawals, fee-on-yield, adapter allowlist
- `vault-v7.clar` — new candidate; isolated positions and stricter settlement/authorization
- `adapters/zest-earn-adapter.clar` — legacy Zest Earn (sync)
- `adapters/zest-earn-adapter-v7.clar` — paused candidate requiring further protocol validation
- `adapters/hermetica-hbtc-adapter.clar` — legacy async adapter; blocked by unresolved finding H-01
- `adapters/hermetica-hbtc-adapter-v7.clar` — separate serialized-claim candidate with durable user receipts
- `traits/{sip-010-trait,yield-source-v2,yield-source-async-v1}.clar`

## Repository layout

```
contracts/   Clarity smart contracts + Clarinet/Vitest tests
  fork-test/ standalone mainnet-fork harness (real Hermetica contracts)
indexer/     Node/TS service: validated feeds; oracle writes disabled by default
frontend/    React + Vite dApp
integrations/ Source-pinned Stacks, Bitcoin and PoX-5 clients plus real-state fork proofs
scripts/     Locked dependency bootstrap
docs/        SECURITY.md, AUDIT_NOTES.md
MAINNET-DEPLOY.md   Asigna deploy runbook
```

## Getting started

Prerequisites: **Node 24**. Install every package from its lockfile, including the sibling integration packages imported by the frontend:

```bash
node scripts/bootstrap-rebuild.mjs
npm --prefix contracts test
npm --prefix contracts run test:v7:report
npm --prefix contracts run test:v7:adapters
npm --prefix contracts run test:hermetica:v7:report
npm --prefix indexer test
npm --prefix indexer run build
npm --prefix integrations/stacks test
npm --prefix integrations/bitcoin test
npm --prefix integrations/pox5 test
npm --prefix frontend test
npm --prefix frontend run build
```

The bootstrap copies only documented public development-wallet fixtures when absent. It never creates or reads production signing credentials. For read-only remote fork proofs and network configuration, follow the [Stacks](docs/integrations/stacks.md), [Hermetica](integrations/hermetica/README.md), [Bitcoin](docs/integrations/bitcoin.md), and [PoX-5](docs/integrations/pox5.md) guides.

Copy each `.env.example` to the appropriate local env file before running the
indexer/frontend (`frontend/.env.test` ships with public test values).

## Security

The current internal review, reproducible findings, test scope and remaining risks are
in [SECURITY-REVIEW.md](contracts/reports/SECURITY-REVIEW.md). Passing a test that
reproduces Hermetica's third-party redemption defect does not mean it is fixed.
Local accounting shims are not evidence of a funded real-protocol redemption.
Production requires an independent audit of the exact release, verified external
integration round trips, reviewed multisignature administration, monitoring, and incident procedures.

**Risk note:** Lending is not a guarantee of principal. Smart-contract defects, bad debt, liquidity constraints, governance and sBTC peg risks can cause loss.

## Deployment

The new candidate is deployed only on testnet. Resume its verification with the
[testnet runbook](docs/validation/testnet-runbook.md). The existing v6 deployment
plan and `MAINNET-DEPLOY.md` remain historical operational references; they are not
authorization or evidence of a v7 production release.

## License

Proprietary — all rights reserved (pending license decision).
