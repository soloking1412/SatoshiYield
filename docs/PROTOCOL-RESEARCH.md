# Protocol integration research

Verified against primary sources on **1 October 2026 (Asia/Kolkata)**. Public documentation, read-only RPC inspection, and repository interfaces are evidence of a candidate integration; they do not establish that a SatoshiYields adapter is audited, deployed, funded, or safe to enable. No external protocol writes were enabled during this research. Targets and incentive APRs are not realized returns or guarantees.

## Current decisions

| Product | Capital and yield mechanism | Integration boundary | SatoshiYields status |
| --- | --- | --- | --- |
| Zest sBTC supply | sBTC supplied to a lending vault; zsBTC shares represent the claim | Stacks Clarity; liquidity and share-price accounting | Direct current-vault route implemented; exact-source funded fork passed; legacy vault deposits remain disabled |
| Hermetica hBTC | sBTC vault with borrowing, stablecoin yield, and strategy accounting | Stacks Clarity; queued redemptions, NAV, governance and downstream exposures | Replacement adapter and third-party redemption recovery pass local/funded fork checks; upstream deposits currently disabled |
| StackingDAO stBTC | sBTC reserves and PoX-5 sBTC bond positions; stBTC ratio grows | Direct wallet receipt route with queue/reserve checks | Deposit/idle exit and owned-NFT claims implemented; new queue guard candidate not publicly deployed |
| StackingDAO stSTX / stSTXbtc | STX capital; STX compounding or BTC/sBTC rewards | Separate STX asset vault and accounting, never substitute sBTC | Research only |
| Native Stacks Bitcoin Staking | BTC timelocked on Bitcoin L1 plus STX bond; miner-funded BTC rewards | Bitcoin transaction flow plus Stacks bond state; custody differs by direct/pooled path | Official PoX-5 SDK eligibility and recovery preparation implemented; public allowance and funded registration still required |
| Dual Stacking pilot | Former sBTC/STX incentive program | Retired rewards, historical display only | Do not advertise ongoing APY |
| Babylon native BTC staking | Native BTC script commits slashable voting security to a finality provider | Bitcoin scripts/PSBTs plus Babylon Genesis; token rewards distinct from BTC principal | Real-SDK Signet unsigned plans and recovery preparation implemented; full funded registration/unbonding pending |
| Lombard LBTC | Current yield-bearing BTC receipt with covered-call strategy | Consortium custody, destination token, redemption and optional bridge | Sandbox quote/fee authorization/address flow implemented; funded issuance/redemption pending; not labelled Babylon staking |
| SolvBTC / Solv Vaults | BTC custody and mapped tokens; selected vault adds its own strategy | FROST custody plus destination-chain contracts and bridging | Research only; each strategy needs its own allowlist |

## Stacks and sBTC candidates

### Zest: distinguish lending from newer leveraged vaults

The current market documentation identifies `vault-sbtc` as the sBTC lending vault issuing 8-decimal zsBTC shares. This is a supply position, not native Bitcoin staking. [Official vault reference](https://docs.zestprotocol.com/stacks-market/contracts/vaults).

The local adapter pins `SP1A27KFY4XERQCCRCARCYD1CC5N7M6688BSYADJ7.v0-vault-sbtc`. A read-only Hiro source response on the verification date reported publish height **6,162,063** and exposed `deposit(amount, min-out, recipient)`, `redeem(amount, min-out, recipient)`, and `convert-to-assets(amount)` returning `(ok uint)`. This confirms interface existence, not liquidity, acceptance of new deposits, governance state, or current vault selection. [Published source API](https://api.hiro.so/v2/contracts/source/SP1A27KFY4XERQCCRCARCYD1CC5N7M6688BSYADJ7/v0-vault-sbtc?proof=0).

Zest separately documents a live **zvstBTC** product using `zv-engine-stbtc-0`, `zv-state-stbtc-0`, and `zv-ops-stbtc-0` under the same issuer. Its sBTC entry converts to stBTC and its operator manages a leveraged strategy. It needs a separate adapter and risk model; replacing the lending vault name is insufficient. [Official zvstBTC contracts](https://docs.zestprotocol.com/stacks-vaults/contracts).

**Testnet:** no current official deployment manifest for either production product was verified. A local mock or mainnet read-only fork is not a deployed protocol testnet. Before approval, verify exact deployed source hashes, registry-selected version, allowed caller/token, rates, share conversions, liquidity limits, NAV loss, exit behavior and all upgrade authorities.

### Hermetica hBTC

The official flow deposits BTC through the sBTC route or sBTC directly, represents ownership in hBTC, and describes borrowing stablecoins against sBTC, deploying into yield strategies and converting profits into sBTC. Redemptions include a cooldown and optional express path. The reserve does not create an unconditional principal guarantee. [Official capital flows](https://docs.hermetica.fi/hbtc/how-it-works/flows). NAV may move down as well as up; reporting is daily mark-to-market. [Accounting](https://docs.hermetica.fi/hbtc/how-it-works/accounting).

The published contract page lists issuer `SP1S1HSFH0SQQGWKB69EYFNY0B1MHRMGXR3J1FH4D`, `vault-hbtc-v1`, `state-hbtc-v1`, `token-hbtc`, governance, blacklist and reserve contracts. The repository also references `vault-hbtc-v1-2`. **That version mismatch must be resolved against current governance state and on-chain source before any deposit integration.** [Official contract addresses](https://docs.hermetica.fi/hbtc/how-it-works/smart-contracts).

**Testnet:** no verified current official deployment. Required gates: permissionless caller compatibility, correct reserve/token/controller graph, minimum shares, fees at request versus settlement, claim ownership, cooldown, reserve liquidity, negative NAV, queue liveness, blacklist/pause effects, and full redeem tests. Public target yields are not a live APY feed.

### StackingDAO

Current official documentation distinguishes STX-funded stSTX and stSTXbtc from **stBTC**, funded by sBTC or BTC via the sBTC peg. stBTC backing spans liquid sBTC reserves and PoX-5 sBTC bonds, with redemption to sBTC. [Product overview](https://docs.stackingdao.com/stackingdao).

**Compatibility:** stSTX/stSTXbtc require separate STX accounting and receipt/reward handling. stBTC needs its own audited adapter, dynamic reserve checks and delayed exit state. A liquid receipt token does not guarantee instant underlying redemption. **Testnet:** no current verified manifest was found in the reviewed sources. Do not reuse older core-v4 STX addresses for stBTC.

### Native Bitcoin Staking and retired incentives

The September 25 recap establishes production Genesis bonds, distinguishes direct BTC L1 timelocks from pooled sBTC, and states that the direct path is currently whitelisted for anchor participants with 50+ BTC. The pooled path has signer and custody assumptions. Rates are targets and access depends on capacity. [Genesis Bond recap](https://www.stacks.co/blog/genesis-bond-14-day-recap). The launch announcement states PoX-5 activated July 30, 2026 and Genesis launched September 10. [Launch details](https://www.stacks.co/blog/the-genesis-bond-is-live-institutions-begin-bitcoin-staking-on-stacks).

The **Dual Stacking pilot ended at Bitcoin block 966,350**. No new deposit should be recommended on the basis of its former bonus yield. [Official wind-down](https://www.stacks.co/blog/dual-stacking-winds-down-on-september-10-as-bitcoin-staking-arrives). The subsequent 90-day incentive specifically targets eligible USDCx debt and liquidity positions; do not add it automatically to ordinary supply APY. [Incentive scope](https://www.stacks.co/blog/stacks-90-day-defi-incentive-program-announced-with-zest-and-bitflow).

**Testnet:** Stacks reported public PoX-5 testnet work in Q2, but this research has not qualified current testnet contract IDs and lifecycle endpoints for a third-party integration. [Q2 report](https://www.stacks.co/blog/q2-2026). Shipping needs a dedicated Bitcoin wallet/PSBT flow, exact script and timelock validation, STX allocation, current-network PoX discovery, period/capacity checks, BTC confirmations and independent recovery testing. It must remain separate from an sBTC deposit transaction.

## External Bitcoin staking and yield

### Babylon native staking

Babylon's current FAQ confirms native Bitcoin is not bridged or pegged, but delegated provider misconduct can cause partial BTC slashing. Positions unbond in full, not partially. Lock periods, confirmation requirements and slashing parameters must be obtained from the current network; examples in documentation are not transaction authorization. [Official FAQ](https://docs.babylonlabs.io/guides/support/faqs/).

There is an official reference staking app, its source, the `@babylonlabs-io/btc-staking-ts` library, and mainnet/testnet app links. [Integration reference](https://docs.babylonlabs.io/developers/babylon_genesis_chain/dapps/simple_staking_dapp/). The wallet guide names Babylon testnet `bbn-test-6`; verify this at integration time because testnets reset. [Wallet/network guide](https://docs.babylonlabs.io/developers/babylon_genesis_chain/wallet_setup/).

**Route:** Bitcoin staking scripts and PSBTs, Babylon delegation, finality-provider identity, reward claims, early unbonding and withdrawal form a separate state machine. Verify BTC network, destination scripts, public keys, fees, change outputs, timelocks, provider commission/slash exposure, confirmations and redemption recovery. Never represent BABY/other security rewards as guaranteed BTC APY. No Stacks Clarity adapter can hold a user's native Bitcoin UTXO directly.

### Lombard LBTC and BTC.b

Current documentation says **LBTC yield comes from a covered-call strategy managed by Bitwise Investment Manager**, with a variable target; BTC.b is a separate non-yielding receipt. Historical descriptions calling current LBTC only a Babylon staking receipt are outdated. [Current official FAQ](https://docs.lombard.finance/use/faq).

Both issuance and cross-chain transfers rely on Lombard's consortium and other infrastructure. Current bridging documentation also records September 2026 chain deprecations, so integration should query and pin the exact supported chain, token, bridge lane and redemption path instead of copying an old chain list. [Custody and verification architecture](https://docs.lombard.finance/learn/products/infrastructure), [current chain support](https://docs.lombard.finance/use/bridging).

**Verified test route:** SDK `Env.testnet`, `partnerId: 'test'`, Bitcoin Signet and Sepolia funding are documented. [SDK FAQ and test instructions](https://docs.lombard.finance/build/sdk/faq). Use a dedicated module with BTC and destination-chain wallets, deposit address verification, receipt claim, delayed redemption and bridge status. Production needs verified per-chain contract addresses/source, reserve observation, redemption terms and strategy/custody disclosures. No LBTC token contract address was approved by this review.

### SolvBTC and strategy vaults

Solv explicitly describes protocol-managed BTC addresses, FROST threshold signing, and mapped tokens on destination chains. That is materially different from user-controlled native Bitcoin staking. [Bitcoin custody and issuance architecture](https://docs.solv.finance/solvbtc-technical-architecture/bitcoin-mainnet-architecture). Vaults add separate strategies: collateralized borrowing, liquidity provision, trading, staking or off-chain deployments; their risks and reward denominations cannot be merged into one generic Bitcoin yield rate. [Vault strategy breakdown](https://docs.solv.finance/key-products/solv-vaults-lsts/breakdown-of-solv-vaults).

The official supported-chain page lists heterogeneous bridges and burn/mint versus lock/mint mechanisms, and does not establish a Stacks-native adapter. [Supported blockchains](https://docs.solv.finance/solvbtc-technical-architecture/solvbtc-integration/supported-blockchains). **Testnet:** a currently supported public end-to-end BTC deposit/vault/redemption environment was not verified. A documentation API credential labelled `test` is not evidence of a testnet. Require exact chain and token allowlists, current vault composition, signing governance, custody disclosure, reserve proof, fees, redemption SLA and partner-supported test infrastructure.

## Admission and monitoring rules

1. Pin asset, chain, principal/address, function ABI and deployed code hash; verify current governance, registry selection, pause state and upgrade authority.
2. Separate external custody/bridging and native BTC staking from Stacks sBTC deposits. Every route needs explicit asset/network review and its own withdrawal lifecycle.
3. Run unit, property, adversarial and integration tests against the selected release. Record confirmed testnet transactions and a complete withdrawal before canary use. Mock tests prove local behavior only.
4. Measure actual received assets/shares; enforce minimum output, maximum fee, exact postconditions/allowances and restricted callbacks. Never assume full principal recovery.
5. Publish APY only from fresh, identified observations; separate base yield, incentive yield, reward denomination and fees. Show measurement window and provenance. Unknown is not zero, target, or stale-as-fresh.
6. Keep deposits disabled until independent review and explicit deployment approval. A feed being online does not mean an adapter is safe, approved or even deployed. Preserve legacy withdrawals.
7. Monitor share/NAV losses, redemption queues, liquidity, oracle age, chain identity, signer health, governance upgrades, bridge pauses and contract code changes. A single process controlling two oracle keys is not independent oracle operation.

## Indexer remediation delivered in this rebuild

The indexer no longer republishes stale anchors or invented bootstrap targets, clips anomalous rates into a plausible cap, or steps synthetic rates around deviation guards. It reads actual committed oracle state rather than guessing from proposed reports; validates exact uint encodings and boolean API success; checks explicit network configuration; and defaults signing to off. Yield rows carry review status, data status, risk factors, native sample availability and protocol-level TVL scope. Price history rejects expired/future/corrupt samples. The public testnet faucet uses a separate key, the signer's nonce, and serialized rate-limit reservations. Tests cover these failure cases.

Remaining operational limits: RPC responses are not independently verified proofs; persisted APY history is local trusted state; faucet quotas are per process and need shared durable storage for multi-instance deployment; successful broadcast is not confirmation; protocol-specific testnet evidence remains outstanding where noted above. This work is an internal engineering review, not an independent security audit or a guarantee of safety.

Implementation evidence is maintained separately: [Stacks](integrations/stacks.md), [native PoX-5](integrations/pox5.md), [Bitcoin routes](integrations/bitcoin.md), and the [Hermetica real-state fork](../integrations/hermetica/README.md). A source-pinned contract or successful preparation is not a claim of completed public end-to-end validation.
