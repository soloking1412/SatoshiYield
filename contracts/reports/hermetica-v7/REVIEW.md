# Hermetica v7 candidate — attribution and recovery review

Internal implementation review, 1 October 2026. This candidate is not deployed or approved for mainnet. Current Hermetica deposits are disabled. The existing vault-v6 and frozen vault-v7 sources are unchanged.

## Implemented behavior

[hermetica-hbtc-adapter-v7.clar](../../contracts/adapters/hermetica-hbtc-adapter-v7.clar) binds the canonical sBTC token, `vault-hbtc-v1-2`, `hq-v1`, `state-hbtc-v1`, expected HQ governor and local `vault-v7` immutably. It starts paused. It implements the existing asynchronous adapter trait; no core vault or trait change is required.

Only one upstream redemption can remain outstanding at a time. Deposits and additional redemption requests are blocked until that claim is settled or cancelled. Anyone can call `settle-pending`; settlement assigns a durable receipt to the recorded user and frees the queue. The user's later vault claim pays that receipt. A user withholding their final claim therefore does not hold the queue indefinitely.

The account invariant is:

```
adapter sBTC balance >= sum of durable user receipt liabilities
free balance = adapter sBTC balance - receipt liabilities
```

Each upstream request records its free-balance baseline. Settlement credits only the increase above that baseline. Settling adds the receipt and liability together, returning free balance to its original baseline. Paying receipt A decreases balance and liability by the same amount, so it cannot change pending B's baseline or entitlement. Deposits consume exactly their incoming amount. All these relationships are checked on chain, and unexpected upstream errors roll back atomically.

**Donation policy:** sBTC already present before a request is inaccessible surplus, never swept. sBTC donated while the singleton request is pending belongs to that claimant on settlement. Donations received during a subsequently cancelled request become baseline surplus. This explicit policy prevents timing-dependent allocation between multiple pending claims, but does not let a donor recover their donation. Untracked donated hBTC shares are also not allocated or swept.

## Why a deleted claim can be recovered

The exact immutable upstream source has only two claim deletion paths: [published source](https://api.hiro.so/v2/contracts/source/SP1S1HSFH0SQQGWKB69EYFNY0B1MHRMGXR3J1FH4D/vault-hbtc-v1-2?proof=0), SHA-256 `bb2576db30a8e45d5bb3322614606151c74bd351c6dcbf65ec65ed6ac60194dd`.

- `redeem-internal`, line 163: deletion follows transfer of recorded net assets to the recorded user. The caller can be anyone; the recipient remains the adapter.
- `cancel-redeem`, line 227: deletion requires the immediate caller to be the recorded user, requires an unfunded non-express claim, and returns escrow shares. Only this adapter can satisfy that authorization for its claims. Its cancellation clears the pending record in the same atomic transaction.

Blacklist and governance changes do not add a deletion path. A funded claim cannot be cancelled. The peg-out wrappers either require the recorded user or revert the complete redemption. Consequently, for this specific source, an adapter-recorded pending claim returning exactly `err u103003` means its successful redemption already occurred. With only one outstanding claim and prior receipts excluded, the free-balance increase remains attributable even after the upstream claim record disappears. Other errors are propagated and never treated as redemption.

This argument is version-specific. It does not apply to arbitrary async adapters, a pooled sweep, a different Hermetica version, or the unchanged legacy adapter.

## Current source and governance verification

[upstream-binding.json](upstream-binding.json) retains seven primary-source hashes and exact deletion locations. [mainnet-snapshot.json](mainnet-snapshot.json) records all reads at canonical height **9101467**, index hash `0xb60699a21bfeaa4ddd725da2bbfee0457bde43f0d0c05730ad27cd6c36aff079`.

At that block HQ recognizes `vault-hbtc-v1-2` as a protocol and returns false for v1, v1-1, v1-3 and v1-4. Its governor is `SMJSVT0J9K2DKM8QWXSHXPVTYPJBV4CC5P1ZXAW0`. The global protocol, vault, redemption and request-redemption switches are enabled, but **deposits are disabled**. Cooldown is 259,200 seconds. The [official contract page](https://docs.hermetica.fi/hbtc/how-it-works/smart-contracts) still names v1; the on-chain HQ role reads establish the selected v1-2 controller instead of assuming the documentation is current.

`npm run verify:hermetica:v7` performs read-only live verification of all seven hashes, the expected governor, selected controller role, and admission switches. It never signs or broadcasts. The latest run checked height **9101528** and again returned `upstreamDepositEnabled: false`. `--write` refreshes the public snapshot explicitly. Changed governance blocks deposits in the adapter; existing withdrawal paths continue to call the pinned upstream and remain subject to its permissions.

## Validation

`npm run test:hermetica:v7:report` passes **19 tests**, including **600 randomized actions across three recorded seeds**. Every action class must execute for each seed. The suite checks receipt liabilities, tracked principal, vault principal and conservation of minted tokens after every randomized action. It covers:

- third-party funding/redemption and deleted-claim recovery;
- two users, singleton admission and settlement without claimant participation;
- baseline donations, pending donations and receipt A paid while B is pending;
- unauthorized calls, cancellation ownership, funded/settled cancellation rejection;
- true shares, upstream fee snapshots and funded-value stability;
- partial loss with actual mock token burning, rejected minimum payout rollback;
- total-loss funding failure, unexpected errors, false payout reports;
- cooldown, lack of liquidity, blacklist, pause and governance changes;
- existing exits despite local pause, revoked onboarding and stale APY.

Coverage is **225/242 lines (92.98%)**, **59/113 branches (52.21%)**, and **32/38 functions (84.21%)**. Detailed costs, seeds, source hash and precise limitations are in [local-validation.json](local-validation.json). The six unused functions are read accessors; additional unexecuted branches remain.

These are local token-moving semantic models. The adapter test source differs only in four literal principal bindings, recorded by the preparation script. The upstream model uses burn blocks for its cooldown and is not a substitute for the actual seconds-based upstream. The root-owned [funded real-source fork evidence](../../../integrations/hermetica/evidence/mainnet-fork.json) also passed against the unchanged candidate SHA `c6c03c59a012f8e686c577da446f3536321595a6faefda47291eb7fcc2884e08`, pinned at height 9101467 using SDK 3.24.1 and epoch 4.0. It first rejected the currently paused deposit with rollback, then enabled deposits by impersonating the verified governor **only inside the local fork**. A real 100,000-satoshi sBTC deposit minted 98,041 hBTC shares. Request, cancellation and re-request worked. Premature settlement failed. Advancing 435 local burn blocks satisfied the actual 259,200-second contract timestamp cooldown. An unrelated local caller funded and redeemed the claim for 99,999 sats, deleting the upstream claim. The adapter recovered a durable 99,999-sat receipt, preserved it when a 100,000-sat minimum rejected payout, then paid the user 99,999 sats and cleared all liabilities/positions. Positive calls executed with native SDK Deny postconditions. No mainnet transaction was broadcast. This one real-source lifecycle is separate from the 19 local tests; it does not cover every economic condition or replace independent audit.

## Remaining risks and gates

The singleton queue deliberately trades throughput for attributable recovery. An unfunded claim can block new requests and deposits during the real cooldown, upstream pause, blacklist, insufficient reserve liquidity, or source-role revocation. Permissionless settlement prevents the claimant from withholding a completed claim; it cannot fix upstream delays. Unfunded cancellation remains available only when upstream allows it.

A true zero-value upstream claim cannot currently be funded because the upstream requires positive assets. The adapter preserves that pending claim and error instead of pretending it was redeemed for zero. Cancellation restores the underlying shares, not lost principal. Recovery from complete upstream loss requires an upstream/governance resolution or separately reviewed migration.

Hermetica pricing, reserve custody, protocol roles, blacklist and token/governance risks remain. A stable source hash does not freeze its mutable accounting or strategy assets. There is no promised principal protection or yield. An owner/governance rotation fails deposit admission and requires a new review; the owner cannot redirect payouts or sweep receipts.

Before release: review exact transaction postconditions for the full canonical custody graph, extend funded fork coverage for remaining economic/governance scenarios, commission independent external audit, review source/deployment hashes, and wait for actual upstream admission to reopen. No public testnet mock deployment proves that a mainnet provider accepts deposits. The candidate retains the original oracle's bounded-deviation admission policy; abrupt genuine rate changes require an explicit recovery procedure, never fabricated intermediate reports.
