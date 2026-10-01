# Direct Stacks protocol routes

Implemented in `integrations/stacks` and exposed at `/integrations` in the frontend. These are direct user positions, separate from the SatoshiYield pooled vault. No mainnet transaction has been signed or broadcast as part of validation. No claim of independent audit is made.

## Supported operations

| Protocol | Input and receipt | Implemented wallet plan | Custody and limits |
|---|---|---|---|
| Zest current sBTC lending | sBTC → zsBTC (`zft`, 8 decimals) | `deposit(amount,min-out,owner)` and `redeem(shares,min-out,owner)` | Receipt mints directly to the owner. Lending liquidity and pause state can prevent redemption. This is the current v0 lending vault, not the separate leveraged zvstBTC product. |
| StackingDAO stBTC | sBTC → stBTC (8 decimals) | `deposit(amount,min-shares-out)` and `withdraw-idle(shares)` | Receipt mints directly to the owner. Idle exit applies the protocol fee; reserve payout is protected by a minimum outgoing sBTC postcondition. |
| StackingDAO existing withdrawal NFT | Owned `withdraw-nft` → sBTC | `withdraw(nft-id)` after recorded burn-height maturity | Exact recorded net payout, exact escrow-share burn, and exact owned NFT movement are protected. Dedicated claim reads avoid deposit/reward/active-pool ratio dependencies. |
| StackingDAO new queued exit | stBTC → owner’s withdrawal NFT | Atomic guard source and route builder implemented; **production signing disabled** | `queueGuard` is null until reviewed deployment. The unguarded upstream `init-withdraw` has no minimum entitlement, fee cap, or wait cap. |

The official post-PoX-5 `stacking-dao-core-stbtc-v1` accepts **sBTC**. The separate stSTX and stSTXbtc products accept **STX**; they are not substituted into these routes. Native BTC bond eligibility is implemented separately in `integrations/pox5`; Bitcoin staking preparation in `integrations/bitcoin` has distinct networks and custody assumptions.

## Mainnet bindings

- Canonical sBTC: `SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token`, FT asset `sbtc-token`. Available balance is read with `get-balance-available`; locked sBTC is not counted as spendable.
- Zest: `SP1A27KFY4XERQCCRCARCYD1CC5N7M6688BSYADJ7.v0-vault-sbtc`; receipt asset `zft`. Registry `v0-assets` must identify this vault and underlying sBTC must match.
- StackingDAO issuer: `SP4SZE494VC2YC5JYG7AYFQ44F5Q4PYV7DVMDPBG`; core `stacking-dao-core-stbtc-v1`, receipt `stbtc-token::stbtc`, reserve `stbtc-reserve`, accounting `data-stbtc-v1`, DAO `dao`, claim data `withdraw-data-stbtc`, NFT `stbtc-withdraw-nft::withdraw-nft`, reward stream `rewards-pox5-v1`.

`manifests/mainnet.json` includes immutable source SHA-256, source/ABI file paths, publication heights, official repository commit and byte comparison when available. `SOURCES.md` explains provenance differences. Runtime verification uses exact deployed source bytes. Contract code is immutable, but privileged governance state, token mint/burn authority, reserve allocations and claim records are not frozen by a source match.

Official primary references:

- [Zest production deployment manifest](https://github.com/Zest-Protocol/zest-v2-contracts/blob/main/mainnet/README.md) and [vault APIs](https://docs.zestprotocol.com/stacks-market/contracts/vaults).
- [StackingDAO production contracts](https://github.com/StackingDAO/stackingdao-smart-contracts/blob/main/mainnet/README.md) and [protocol documentation](https://docs.stackingdao.com/stackingdao).
- [Stacks postconditions](https://docs.stacks.co/post-conditions/examples): burns count as outgoing transfers; newly minted receipts do not require outgoing postconditions.
- [Hiro API migration](https://docs.hiro.so/en/apis/stacks-blockchain-api/v1-to-v3-migration): block reads use `/extended/v2/blocks/{height}`; transaction receipts in the app use the v3 transaction endpoint.

## Snapshot and transaction protections

The SDK has no private-key, wallet, signing, broadcasting or approval method. It creates reviewed, unsigned parameters only.

1. Require canonical mainnet wallet checksum and chain ID 1. Resolve the canonical block's **index block hash**, cross-check its height/hash against node info, and pin every contract state read to that index hash.
2. Verify every configured dependency's exact deployed source hash. Sources are cached for five minutes because source bytes are immutable; balances and mutable protocol state are never cached as current authorization.
3. Require complete, even-length, canonical Clarity encoding. Reject malformed, truncated and trailing data. Use uint128 integer arithmetic, never floating-point token amounts.
4. Check current pause/permission state, available owner balance, cap and liquidity. StackingDAO quotes include rewards that the real public call processes before minting or redeeming; unexpected reward keeper authority and inconsistent ratios fail closed.
5. Observations expire after 60 seconds, including time spent reading. Snapshot/quote objects are frozen and tied to the creating client. Forged, foreign-client, expired, wrong-network and wrong-wallet plans are rejected.
6. Use deny-mode postconditions: exact user debit, zero unintended user sBTC/STX movement, required receipt burns, minimum reserve/vault payout, and bounded reward-stream movement. The pinned immutable source establishes the fixed payout recipient; a sender postcondition alone does not assert the destination.
7. The frontend re-reads before wallet review and refuses to weaken the displayed minimum output, maximum fee, maximum initial wait or owner. A changed limit requires new explicit review. The wallet layer separately revalidates current account identity.
8. Wallet submission is recorded as pending. Portfolio activity verifies the canonical receipt matches the recorded sender, contract, function and arguments. Failed, dropped, mismatched and unavailable receipts are distinct from success.

SIP-010 direct calls use caller authority; no ERC-20-style approval transaction is needed. Network fees remain separately disclosed by the wallet. The idle-exit ABI has no explicit fee-cap argument: an inclusion-time fee increase is bounded by the minimum net payout, so the displayed protocol fee is an estimate. The queued guard separately enforces an explicit maximum fee. Deposit share slippage or exit minimum does not guarantee future principal value.

## Queued request guard

`contracts/stackingdao-request-guard-v1.clar` is a candidate, not a deployed production contract. Its exact source hash is in `manifests/queue-guard.json`. It accepts only `(shares, min-sbtc-entitlement, max-fee-bps, max-cooldown-burn-blocks)`, rejects forwarded authority, and calls the fixed upstream core with the original `tx-sender`. It never takes custody and has no administrator, arbitrary destination, arbitrary asset or upgrade switch.

The guard checks the fee and cooldown before requesting. After the upstream call, it verifies the newly created NFT belongs to the original user, the recorded shares match, the recorded fee fits the cap, the resulting net future entitlement satisfies the minimum, and the recorded unlock height is within the consented burn-block duration. Any error reverts the nested request, token movement and NFT creation atomically.

The guard protects admission-time consent. StackingDAO governance can later update claim records and protocol activity, so claim amount and timing remain subject to upstream trust. No guaranteed calendar withdrawal deadline is shown.

## Validation evidence

`evidence/mainnet-readonly.json` records live canonical snapshot verification and non-signing route preparation. No official current public testnet deployment for these exact Zest and StackingDAO contracts was verified, so `publicTestnetDeployment` is null. The following proof is a **local mainnet fork**, not a public testnet transaction.

`evidence/mainnet-fork.json` passed at pinned Stacks height **9,101,400**, using Clarinet SDK **3.24.1**, real deployed Clarity 6 source/state, and the existing funded public holder `SP2C7BCAP2NH3EYWCCVHJ6K0DMZBXDFKQ56KR7QN2`. No canonical sBTC mint, wallet balance override, transfer shim, synthetic protocol implementation or privileged mainnet signature was used. Standard public simnet test mnemonics are fixtures only.

| Fork action | Exact observed units (8 decimals) |
|---|---|
| Zest deposit | 100,000 sBTC units → 99,940 zsBTC units |
| Zest redemption | 99,940 shares → 99,999 sBTC units; one-unit rounding loss |
| Missing receipt burn postcondition | Native deny enforcement rejects and restores balances |
| StackingDAO deposit | 100,000 sBTC units → 99,790 stBTC units |
| StackingDAO idle exit | 99,000 sBTC units received, 999 units protocol fee, one-unit conversion rounding |
| Guarded queued exit | 99,790 stBTC units → NFT #2, 99,999 units recorded net entitlement |
| Guard minimum failure | Error u9004, unchanged user balances, reserves, pending shares and NFT counter |
| Local maturity and claim | 4,200 burn blocks advanced only locally; 99,999 units received; NFT burned; pending accounting restored; zero guard tokens |
| Forwarded guard authority | Error u9001; request cannot use an intermediary as an arbitrary authority path |

Every positive fork transaction runs the native SDK's deny-mode postconditions and an independent event-policy assertion. Guard unit tests separately prove fee-cap, cooldown-cap, minimum-entitlement rollback and direct-caller rejection. Seeded fuzz cases exercise 128 combinations of fee, minimum entitlement and lock duration against the actual guard source, asserting no request-state changes on rejection. Another 2,048 seeded uint128 cases verify exact minimum-output rounding. Unit RPC regressions cover wrong chain/source, malformed Clarity values, exact amount bounds, stale/forged observations, liquidity, permissions, NFT ownership, and mature claims remaining accessible despite invalid deposit ratios, active-pool loss or reward-keeper changes.

The local fork deliberately advances time to exercise actual protocol maturity. It does not bypass a public chain delay or establish current liquidity for a future trade. Fork tests are integration evidence, not proof that losses, governance abuse, custody failure or all bugs are impossible.

## Reproduction

Use Node 22 or later; install the integration's pinned lockfile. Copy the **public fixture only** from `fork/settings/Devnet.toml.example` to `fork/settings/Devnet.toml` and the equivalent under `guard-unit/settings/`. The actual local files are ignored. No private credential is required.

```sh
npm ci --prefix integrations/stacks
npm test --prefix integrations/stacks
npm run verify:mainnet --prefix integrations/stacks
npm run test:fork --prefix integrations/stacks
```

The fork uses the pinned mainnet remote state and requires working public Hiro RPC access. Rate limits or unavailable historical data should fail the test, never substitute fake success. Source pins must only be changed following explicit review of a new deployment; do not automatically refresh them to whatever a node returns.

## Pooled Zest v7 candidate proof

`npm run test:vault:fork` uses the same pinned mainnet fork and deploys the exact local vault-v7 and Zest adapter candidate into that local copy. Two users each deposit 100,000 sats, receive 99,940 shares, and redeem 99,999 sats (one sat of rounding loss each). It asserts min-share/min-payout failure rollback, real Deny-mode receipt-burn protection, donation isolation (37 sats in the adapter, 73 in the vault), zero residual user positions and an exit while both entry pauses are enabled. No mainnet transaction, upstream state override or token mint occurs. The second user receives an ordinary transfer from an existing funded holder inside the fork. [Retained evidence](../../integrations/stacks/evidence/vault-mainnet-fork.json) distinguishes this pooled adapter proof from the direct-wallet route proof. New v7 mainnet funding stays disabled pending release review.
