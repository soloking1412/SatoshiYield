# SatoshiYield — Milestone 1 Submission

**Date:** 2026-04-16
**Deployer address:** `ST1JXS4BTWDNNEX28QS8ABHQSCAD4BQMAN11TP6B1`
**Network:** Stacks testnet

---

## Milestone 1 Criteria

| # | Criterion | Status | Evidence |
|---|-----------|--------|----------|
| 1 | At least 4 protocols aggregated | ✅ | Bitflow, ALEX, Zest, Velar — 4 adapters deployed + read by indexer |
| 2 | Normalized APY and risk data live | ✅ | Indexer serves `{ protocol, apy_percent, risk_level, tvl_usd, ... }` per protocol; risk labels enforced in code |
| 3 | End-to-end testnet deposit flow passing | ✅ | tx `6f550beae0cf85df112120a62bcdd08018765370c33f66adeb43a67f3efbb68a` |
| 4 | End-to-end testnet withdraw flow passing | ✅ | tx `af4070ef48613368db17dd820ca171400b131207082cfca9bc7f605380f251ed` |
| 5 | End-to-end testnet rebalance flow passing | ✅ | tx `d106444d14f944a4b4dee6bb3df15daae064f70830059cdd8dba4dc814a5cee1` |

---

## On-chain deployments (Stacks testnet)

All contracts deployed from `ST1JXS4BTWDNNEX28QS8ABHQSCAD4BQMAN11TP6B1`.

| Contract | Purpose | Explorer |
|----------|---------|----------|
| `yield-source` | Trait (interface) for adapters | [view](https://explorer.hiro.so/txid/ST1JXS4BTWDNNEX28QS8ABHQSCAD4BQMAN11TP6B1.yield-source?chain=testnet) |
| `mock-sbtc` | SIP-010 token (stands in for sBTC on testnet) | [view](https://explorer.hiro.so/txid/ST1JXS4BTWDNNEX28QS8ABHQSCAD4BQMAN11TP6B1.mock-sbtc?chain=testnet) |
| `bitflow-adapter` | Yield adapter | [view](https://explorer.hiro.so/txid/ST1JXS4BTWDNNEX28QS8ABHQSCAD4BQMAN11TP6B1.bitflow-adapter?chain=testnet) |
| `alex-adapter` | Yield adapter | [view](https://explorer.hiro.so/txid/ST1JXS4BTWDNNEX28QS8ABHQSCAD4BQMAN11TP6B1.alex-adapter?chain=testnet) |
| `zest-adapter` | Yield adapter | [view](https://explorer.hiro.so/txid/ST1JXS4BTWDNNEX28QS8ABHQSCAD4BQMAN11TP6B1.zest-adapter?chain=testnet) |
| `velar-adapter` | Yield adapter | [view](https://explorer.hiro.so/txid/ST1JXS4BTWDNNEX28QS8ABHQSCAD4BQMAN11TP6B1.velar-adapter?chain=testnet) |
| **`vault-v2`** | **Non-custodial vault — deposit / withdraw / rebalance** | [view](https://explorer.hiro.so/txid/ST1JXS4BTWDNNEX28QS8ABHQSCAD4BQMAN11TP6B1.vault-v2?chain=testnet) |
| `yield-tracker` | Event log (deposit/withdraw/rebalance history) | [view](https://explorer.hiro.so/txid/ST1JXS4BTWDNNEX28QS8ABHQSCAD4BQMAN11TP6B1.yield-tracker?chain=testnet) |
| `rebalancer` | Thin proxy for `vault.rebalance` | [view](https://explorer.hiro.so/txid/ST1JXS4BTWDNNEX28QS8ABHQSCAD4BQMAN11TP6B1.rebalancer?chain=testnet) |

### vault-v2 fixes over the original vault

1. **TVL-cap bypass on rebalance** — rebalance no longer double-counts the user's position against the cap.
2. **Fee-precision on small yields** — ceiling division ensures micro-yields still pay the protocol fee.

### vault-v2 initialization transactions

Adapter approval (vault-v2 trusts each adapter):

| Adapter | Tx |
|---|---|
| bitflow | `d986519551dab7ddca9a1c270c289ef9b449baf78bae97646783206345c395ed` |
| alex | `79adb0a1c35cabd7256928bc66fd37484955e7c00241659f296363ddaef08f89` |
| zest | `84a980c3550ccfb3777fe3059fbe6dec05cc744bce8727d67bc8af63afcf5c19` |
| velar | `e3256bd8c3e2b52282c98441117878a1b30445824473a52c8fd881d56b3e3816` |

Adapter → vault wiring (each adapter recognizes vault-v2):

| Adapter | Tx |
|---|---|
| bitflow | `7a23f14149902fd8da4394bc3f21cfd8f749c65513fe4c325622f6f4bf92ba56` |
| alex | `23463d719749622e6a588eb82f0f2918f4d9d9217a64afe389ec739dee024521` |
| zest | `b4c449b0d47fdcfeffbba2cdebc3c70bfaecf33209d246642856f73742080e08` |
| velar | `af30459cd42305b6ce0eceb73c8be10f70c73a02b730296f17cab7a6d0fbb914` |

---

## End-to-end testnet flow (proof)

Reproducible via `node scripts/e2e-testnet.js` with the deployer keys.

```
Deposit   0.001 sBTC  → bitflow-adapter
Rebalance              bitflow → velar
Withdraw  0.001 sBTC  ← velar-adapter
```

| Step | Function called | Txid | Explorer |
|---|---|---|---|
| 1. Deposit | `vault-v2.deposit(bitflow-adapter, u100000)` | `6f550beae0cf85df112120a62bcdd08018765370c33f66adeb43a67f3efbb68a` | [open](https://explorer.hiro.so/txid/6f550beae0cf85df112120a62bcdd08018765370c33f66adeb43a67f3efbb68a?chain=testnet) |
| 2. Rebalance | `vault-v2.rebalance(bitflow-adapter, velar-adapter)` | `d106444d14f944a4b4dee6bb3df15daae064f70830059cdd8dba4dc814a5cee1` | [open](https://explorer.hiro.so/txid/d106444d14f944a4b4dee6bb3df15daae064f70830059cdd8dba4dc814a5cee1?chain=testnet) |
| 3. Withdraw | `vault-v2.withdraw(velar-adapter)` | `af4070ef48613368db17dd820ca171400b131207082cfca9bc7f605380f251ed` | [open](https://explorer.hiro.so/txid/af4070ef48613368db17dd820ca171400b131207082cfca9bc7f605380f251ed?chain=testnet) |

Post-conditions on the deposit tx prove the non-custodial guarantee: the user sends **exactly** the deposit amount and no more.

Final vault state: `vault-v2.get-total-deposited → u0` and `vault-v2.get-position(deployer) → none` ✅

---

## Live indexer — normalized yield feed

The indexer reads each adapter's `get-apy` + `get-total-deposited` via Stacks read-only calls, converts sats to USD using the live CoinGecko BTC price, and serves the result at `/api/yields`.

Sample output (live fetch from `ST1JXS4BTWDNNEX28QS8ABHQSCAD4BQMAN11TP6B1`):

```json
[
  { "protocol": "bitflow", "apy_percent": 22, "risk_level": "medium", "tvl_usd": 0,
    "lock_period_days": 0, "reward_token": "sBTC", "fetched_at": 1776351583840 },
  { "protocol": "velar",   "apy_percent": 20, "risk_level": "high",   "tvl_usd": 0, "...": "..." },
  { "protocol": "alex",    "apy_percent": 18, "risk_level": "medium", "tvl_usd": 0, "...": "..." },
  { "protocol": "zest",    "apy_percent": 15, "risk_level": "low",    "tvl_usd": 0, "...": "..." }
]
```

Sorted by APY descending. No mocks — every number is read from chain or a live price API.

### Indexer routes
- `GET /api/health` — health check
- `GET /api/yields` — 4-protocol aggregated yield feed (5 min cache)
- `GET /api/yields/:protocol` — single-protocol lookup (`bitflow`, `alex`, `zest`, `velar`)

---

## Security hardening (this milestone)

- **vault-v2 Clarity fixes**: TVL-cap bypass on rebalance, fee precision on small yields
- **Indexer CORS** restricted to configured origins (no `*`); `trust proxy` set for correct rate-limit IPs
- **In-memory rate limiter** 60 req/min/IP
- **Input validation** on `:protocol` route parameter
- **No stack traces** leaked from the error handler
- **Runtime response validation** on every off-chain call (no blind `as T` casts)
- **Zero hardcoded secrets** — deployer address, indexer URL, CORS origins, Stacks API URL all env-driven
- **Post-conditions in `Deny` mode** on deposit — user wallet rejects any token transfer that doesn't exactly match the deposit amount

---

## Test coverage

| Suite | Count | Result |
|---|---|---|
| Contracts | 9 | `clarinet check` ✓ (10 with vault-v2) |
| Indexer | 17 | `npm test` ✓ |
| Frontend | 13 | `npm test` ✓ |

---

## Repo layout

```
SatoshiYield/
├── contracts/            # Clarity smart contracts (Clarinet project)
├── indexer/              # Express.js yield aggregator (Node 20)
│   ├── Dockerfile        # Production image
│   ├── render.yaml       # One-click Render.com deploy
│   ├── railway.json      # Railway.app deploy config
│   └── .env.example
├── frontend/             # React + Vite dApp
│   ├── vercel.json       # Vercel deploy config
│   └── .env.example
├── scripts/
│   ├── init-vault-v2.js  # Post-deploy init (ran to set up vault-v2)
│   ├── e2e-testnet.js    # End-to-end flow script (runs deposit/rebalance/withdraw)
│   ├── mint-sbtc.mjs     # Mint mock sBTC for testing
│   └── derive-key.mjs    # Derive private key from BIP39 mnemonic
└── MILESTONE-1.md        # This file
```

---

## How to go live publicly (takes ~10 min; Milestone 2 prerequisite)

### 1. Push to GitHub

```bash
cd ~/SatoshiYield
git init && git add . && git commit -m "SatoshiYield Milestone 1"
gh repo create satoshi-yield --public --source=. --push
```

### 2. Deploy the indexer (Render)

1. Go to <https://render.com/> → **New → Blueprint**
2. Point at the GitHub repo — it'll auto-detect `indexer/render.yaml`
3. Add env var `CORS_ALLOWED_ORIGINS` = `https://<your-vercel-domain>.vercel.app`
4. Deploy → copy the URL (e.g. `https://satoshi-yield-indexer.onrender.com`)

### 3. Deploy the frontend (Vercel)

1. Go to <https://vercel.com/new> → import the GitHub repo
2. Root directory: `frontend`
3. Add env vars:
   - `VITE_NETWORK` = `testnet`
   - `VITE_INDEXER_URL` = the Render URL from step 2
4. Deploy

### 4. Update indexer CORS

Add the final Vercel domain to `CORS_ALLOWED_ORIGINS` in Render. Redeploy.

### 5. Smoke test

- Visit the Vercel URL → see 4 yield cards with live APY
- Connect Xverse or Leather wallet on testnet
- Deposit 0.001 sBTC → approve in wallet → confirm on explorer
- Rebalance → Withdraw
- Every action produces a testnet transaction visible on <https://explorer.hiro.so/>
