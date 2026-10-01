# SatoshiYields rebuild plan

Status: rebuilt candidate with real-protocol fork proofs and public mock lifecycle completed; release gates remain, 2026-10-01. Branch `codex/secure-yield-rebuild`. See [validation summary](validation/REBUILD-VALIDATION.md) for exact completed and outstanding work.

The target is a protocol with verifiable accounting and usable exits, followed by individually validated integrations. Neither an APY ranking nor passing mock tests makes a strategy safe. The new contracts are a separate deployment; the published vault-v6 cannot be upgraded by editing this repository.

## Scope and decisions

- Keep the live v6 position/withdrawal interface. Do not automatically migrate or deposit existing users' funds.
- Build v7 with independent positions per wallet and adapter, capital caps, delayed adapter onboarding, frozen entry fee, minimum shares/payout bounds, direct-call user authentication and exact redemption balance accounting.
- Default new deposits to disabled on mainnet. Testnet writes use explicitly configured mock adapters; changing an environment flag cannot enable mainnet deposits.
- Distinguish STX stacking, sBTC lending/liquid staking, native BTC bonds, and external BTC staking/restaking. They have different assets, signing requirements, trust models, redemption delays and loss modes.
- Implement a neutral/copper responsive interface with honest unavailable/loading/error states. Show deposited principal as principal, not current NAV. Do not fabricate historical TVL, audited badges, target yield or principal guarantees.
- Use a new testnet-only wallet funded from a faucet. Its credential is stored outside the repository with owner-only permissions. Never fund it with mainnet assets.

## Phases and completion evidence

| Phase | Work | Required evidence | Status |
| --- | --- | --- | --- |
| 1. Inventory and threat model | Source/chain identity, historical adapter accounting, API data provenance, signing paths | Findings with reproducible tests, official protocol research | Initial review complete; deployed v6/Zest identity pinned and Hermetica route absence verified |
| 2. Core accounting | Additive v7, isolated exposure, delayed onboarding, loss-aware redemption | Clarity compile, unit/adversarial tests, randomized invariant suite, independent review | Implemented candidate |
| 3. App and data | Redesigned routes, exact amounts, explicit network/version, deny-default signing, conservative metadata | Builds, data/transaction regression tests, desktop/mobile inspection | Implemented: 151 frontend tests, both network builds and independent responsive/keyboard/failure-state review passed; hosted preview also builds successfully |
| 4. Public testnet | Publish exact-source v7 + mock token/strategies, initialize, wait timelock, exercise sync/async success/error/fee/loss paths | Canonical transaction IDs, source hashes, balances and event assertions | Seven exact-source contracts deployed; sync/async lifecycle, cancellation and failed unfunded claim passed publicly. Fee snapshot/economics campaign waits for burn block 22731 |
| 5. Protocol adapters | Implement one current external protocol at a time behind admission criteria below | Real protocol fork + supported public environment round trips, redemption/incident coverage | Funded real-state Zest, StackingDAO and replacement Hermetica fork proofs; direct Stacks wallet routes; Babylon plans, Lombard sandbox flow, PoX-5 live eligibility and recovery preparation. See per-route capability limits |
| 6. Production readiness | Multisig custody of administration, monitoring, incident response, independent audit and staged cap-limited launch | Audit report for exact commit/bytecode, rehearsal and explicit production approval | Not complete |

## Integration order

1. **Zest**: reconcile old Earn ABI and address with the current Stacks Market lending vault. Remove production balance-sweep test accommodations. Validate actual share mint/burn and insufficient-liquidity exits. Do not reuse legacy Dual Stacking APY.
2. **Hermetica**: solve redemption attribution first. A third party can redeem a funded upstream pooled claim, after which the original adapter cannot recover the deleted receipt through its normal path. A mock async adapter cannot demonstrate the production integration is fixed.
3. **Stacking DAO stBTC**: verify PoX-5 vault addresses, share conversion, liquid reserve and bond exit semantics. stSTX/stSTXbtc require their own STX path.
4. **Native Stacks BTC staking**: separate native Bitcoin timelock and STX commitment flow, eligibility and recovery tooling. Keep native self-custody distinct from pooled sBTC trust assumptions.
5. **External BTC staking/restaking**: Babylon requires Bitcoin transactions, finality-provider selection, slashing and unbond validation. Lombard and Solv require product-specific custody/bridge and destination-chain integrations. Do not send sBTC to a Bitcoin or EVM route by string substitution. See the current-source matrix in [PROTOCOL-RESEARCH.md](PROTOCOL-RESEARCH.md).

## Adapter admission contract

Each adapter must record exact address, source/ABI hash, asset and decimals, receipt token, entry/exit quote methods, authorized caller, fee model, capacity, oracle dependence, share-accounting and donation behavior, loss accounting, async receipt persistence, pause behavior and upgrade/admin dependencies. Review all downstream contract calls, not just the adapter.

Tests must cover multiple concurrent users, malicious callers, malformed tokens, deposit-to-withdraw round trips, donations, failed/reordered claims, third-party redeem, share rounding, zero/partial/total loss, fee and cap boundaries, stale data, depleted liquidity, owner actions, protocol upgrades and interrupted keeper/oracle services. Strategy-specific tests are required in addition to generic trait tests.

## Test and security limits

The deterministic randomized suite is reproducible state-machine fuzzing, not exhaustive formal verification. Local token-moving mock tests exercise vault accounting and policy but do not establish external liquidity or custody safety. Public testnet execution is separately recorded from local simulation. A professional independent audit is still required before enabling new mainnet funding.

The production delay is 144 Bitcoin burn blocks. Public testnet validation must respect it; local simulation can mine blocks but public time cannot be fast-forwarded. Do not reduce the constant just to report a completed public test.

## Delivery and migration

Review the branch and validation reports before any deployment to the live website or mainnet. Current user edits in README, MAINNET-DEPLOY, ADDING-AN-ADAPTER and existing fork/deployment files are preserved. This work does not authorize moving user funds. Users withdraw from v6 themselves, verify balances, then separately choose a reviewed v7 route after it is released.

## Current implementation packages

- `integrations/stacks`: immutable source bindings, live canonical observations, direct Zest and StackingDAO receipt ownership, deny postconditions, reviewed bounds and a candidate queued-exit guard.
- `integrations/hermetica`: actual funded mainnet-fork proof for the replacement adapter, including permissionless upstream redemption and durable receipt recovery. The public upstream deposit pause stays respected.
- `integrations/bitcoin`: Babylon Signet script/PSBT planning and recovery preparation, Lombard Signet/Sepolia quote and fee-authorization/address workflow, and explicit Solv handoff. Preparation does not equal an active stake or completed bridge.
- `integrations/pox5`: current official SDK, source-pinned bond eligibility, canonical script/height verification and saved-plan recovery preparation. The test wallet has no public bond allowance; funding stays disabled.

Use `node scripts/bootstrap-rebuild.mjs` with Node 24 to install all package lockfiles, including sibling integration dependencies needed by the frontend. Public testnet evidence and actual execution limits take precedence over plans.
