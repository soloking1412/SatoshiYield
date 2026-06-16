# Adding a New Yield Adapter

Adding a new adapter to SatoshiYields after the registry refactor touches exactly
**5 places** — 3 code files + the contract + the deploy plan. Nothing else needs
to change. TypeScript `ProtocolId` and the oracle/aggregator/routes all derive
automatically from the two registry files.

---

## Step 1 — Write the Clarity contract

Create `contracts/contracts/adapters/<name>-adapter.clar`.

- For a **sync** adapter (instant deposit + withdraw): implement `yield-source-v2-trait`.
- For an **async** adapter (instant deposit, two-phase withdraw): implement `yield-source-async-v1-trait`.

Copy an existing adapter as a starting point:
- `adapters/zest-earn-adapter.clar` → sync reference
- `adapters/hermetica-hbtc-adapter.clar` → async reference

Required functions by trait:

| Sync (`yield-source-v2`) | Async (`yield-source-async-v1`) |
|---|---|
| `deposit (uint principal)` | `deposit (uint principal)` |
| `withdraw (uint principal <sip-010>)` | `request-withdraw (uint principal)` |
| `get-apy ()` | `claim-withdraw (uint principal <sip-010>)` |
| `get-total-deposited ()` | `cancel-withdraw (uint principal)` |
| `is-paused ()` | `get-apy ()` / `get-total-deposited ()` / `is-paused ()` |

Add the adapter to `contracts/Clarinet.toml` under `[contracts.<name>]`.

**Hard gates before this adapter can hold real funds:**
- Independent professional audit of the adapter + any external protocol contracts it calls.
- Mainnet-fork test validating the full deposit → withdraw cycle.

---

## Step 2 — Add to the indexer registry (1 line)

Open `indexer/src/registry.ts`. Add one entry to `ADAPTER_REGISTRY`:

```typescript
export const ADAPTER_REGISTRY = defineRegistry({
  zest: { ... },

  myprotocol: {
    defaultName: "myprotocol-adapter",     // on-chain contract name
    envKey: "MYPROTOCOL_ADAPTER_NAME",     // env var for override
    risk: "low",                           // "low" | "medium" | "high"
    referenceBps: 450,                     // bootstrap APY × 100
    hasLiveApy: true,                      // true if a live feed is wired below
    defillamaSlug: "my-protocol",          // DefiLlama slug for TVL
    fetchNativeApy: fetchMyProtocolNativeApy,
  },
});
```

Add `fetchMyProtocolNativeApy` to `indexer/src/fetchers/native-apy.ts`:

```typescript
export async function fetchMyProtocolNativeApy(): Promise<number | null> {
  // return null if no reliable public feed; the oracle holds the last on-chain value.
  const data = await fetchSomeFeed();
  return data ? sane(data.apy) : null;
}
```

Import it at the top of `registry.ts`:
```typescript
import { fetchMyProtocolNativeApy } from "./fetchers/native-apy.js";
```

That is all for the indexer. `ProtocolId`, aggregator, oracle pusher, and routes
all update automatically.

---

## Step 3 — Add to the frontend protocols (1 entry)

Open `frontend/src/constants/protocols.ts`. Add to `PROTOCOLS` (live) or
`COMING_SOON` (pre-launch):

```typescript
export const PROTOCOLS = defineProtocols({
  zest: { ... },

  myprotocol: {
    id: "myprotocol",
    abbr: "MP",
    name: "My Protocol",
    color: "oklch(65% .18 200)",
    kind: "lending",           // "lending" | "strategy"
    principalProtected: true,
    async: false,              // true for two-phase withdraw adapters
    status: "live-yield",
    blurb: "One sentence users see before depositing.",
  },
});
```

`ProtocolId` auto-expands to include `"myprotocol"` — no separate type edit.

---

## Step 4 — Add to `frontend/src/constants/contracts.ts` (1 line × 2)

```typescript
const ADAPTER_NAMES = {
  zest: import.meta.env.VITE_ZEST_ADAPTER ?? "zest-earn-adapter",
  myprotocol: import.meta.env.VITE_MYPROTOCOL_ADAPTER ?? "myprotocol-adapter",
};

export const CONTRACTS = {
  VAULT: ...,
  ADAPTERS: {
    zest: ...,
    myprotocol: `${DEPLOYER}.${ADAPTER_NAMES.myprotocol}`,
  },
} as const;
```

Add `VITE_MYPROTOCOL_ADAPTER` to `frontend/.env.example` and Vercel env vars.
Add `MYPROTOCOL_ADAPTER_NAME` to `indexer/.env.example` and Render env vars.

---

## Step 5 — Add to the deploy plan

Open `contracts/deployments/v6.mainnet-plan.yaml`. Add a new batch (or append to
batch 2):

```yaml
- contract-publish:
    contract-name: myprotocol-adapter
    expected-sender: REPLACE_WITH_ASIGNA_MULTISIG
    cost: 200000
    path: contracts/adapters/myprotocol-adapter.clar
    anchor-block-only: true
    clarity-version: 3
```

Post-publish init via Asigna:
1. `vault-v6.approve-adapter(<deployer>.myprotocol-adapter, <false|true>)` (false = sync, true = async)
2. `myprotocol-adapter.set-vault(<deployer>.vault-v6)`
3. `myprotocol-adapter.set-oracle-at(u0, <oracle-1>)` + `set-oracle-at(u1, <oracle-2>)`

---

## Checklist summary

| # | What | File |
|---|---|---|
| 1 | Write adapter contract | `contracts/contracts/adapters/<name>-adapter.clar` |
| 2 | Register in indexer | `indexer/src/registry.ts` + `native-apy.ts` (1 entry + 1 function) |
| 3 | Register in frontend | `frontend/src/constants/protocols.ts` (1 entry) |
| 4 | Wire contract name | `frontend/src/constants/contracts.ts` (2 lines) |
| 5 | Add to deploy plan | `contracts/deployments/v6.mainnet-plan.yaml` (1 block) |

**Do not touch:** `ProtocolId` type (auto-derived in both packages), aggregator,
oracle pusher, routes, `VALID_PROTOCOLS` — all update automatically.
