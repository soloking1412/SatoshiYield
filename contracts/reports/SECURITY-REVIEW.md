# SatoshiYield contract review — v7 candidate

Reviewed 1 October 2026. This is an internal source review with executable regression, model-based fuzz and simnet tests. It is **not an independent external audit, proof that all bugs are fixed, or approval for a mainnet release**.

## Versions and scope

The published mainnet `SP31VHZWD3QMGHEEZ30GNK7NB9PF1F9FSEV00149V.vault-v6` source matches the local v6 source byte for byte: SHA-256 `6183af69fbc902711548f6de0f397451b293eb2f1f7a48a02f324e587babca49`. See [source comparison](v6-source-comparison.json). No changes to local files can alter this immutable deployment.

The [read-only mainnet snapshot](../../docs/validation/mainnet-snapshot.json) pins configuration and aggregate readings to canonical Stacks block **9098802**, observed at **2026-09-30T20:12:07.730Z**. It retains exact source hashes, request bodies, and decoded results without user position lists. The legacy Zest adapter is deployed, approved, and unpaused; its stale APY (`err u107`) currently blocks the deposit path. The configured Hermetica adapter is absent at `SP31VHZWD3QMGHEEZ30GNK7NB9PF1F9FSEV00149V.hermetica-hbtc-adapter` and unapproved in v6. These are observations at that block, not guarantees of future state or evidence that all other possible adapter deployments were checked.

The additive [vault-v7 candidate](../contracts/vault-v7.clar) has SHA-256 `96d712ca4f75376280b6d22565eef9df0180c57287b3d9b57ef3f88dd1cdfdf3`. It starts paused, with no configured asset and no approved adapters. It supports multiple positions per wallet, keyed by adapter, with separate strategy caps and synchronous or queued exits.

The [Zest v7 adapter candidate](../contracts/adapters/zest-earn-adapter-v7.clar) starts paused. Its exact source and the v7 vault now pass a funded real-state fork with two users against the current Zest vault, including donation isolation, minimum-share/payout rollback, native Deny postconditions and exits while paused; see [the pooled Zest fork](../../integrations/stacks/evidence/vault-mainnet-fork.json). Further adverse market and production operational checks remain release gates. A separate [Hermetica v7 candidate](hermetica-v7/REVIEW.md) now implements serialized upstream claims and durable user receipts, with 19 additional token-moving model tests. It is unreleased, and live upstream deposits are disabled. The original asynchronous testnet adapter remains a mock and establishes no Hermetica compatibility.

## Findings and disposition

| ID | Severity | Finding | Disposition |
|---|---|---|---|
| H-01 | High | Permissionless upstream hBTC redemption can delete a pooled claim before the adapter settles it. Funds then lack a recoverable on-chain per-user entitlement. | Reproduced against the local shim behavior that matches the relevant upstream claim lifecycle; legacy repository Hermetica adapter remains blocked. The new serialized v7 candidate passes H-01 recovery in both token-moving local tests and a funded real-source fork; see its separate report. The pinned mainnet snapshot establishes that the configured adapter is absent and unapproved at block 9098802. This is a latent repository integration defect, not demonstrated live exposure through that v6 route. |
| H-02 | High | v6 admin functions authorize `tx-sender`, allowing an intermediary invoked by the owner to act with owner privileges. | v7 authorizes the immediate caller; user operations reject forwarded calls. Immutable v6 remains unchanged. |
| H-03 | High | v6 trusts an adapter's returned gross amount without verifying that this amount arrived. A buggy adapter can consume other idle vault assets or booked fees. | v7 requires an exact balance increase matching the returned amount and a user-approved minimum net payout. |
| M-01 | Medium | Legacy Zest adapter sweeps its whole sBTC balance as a test-shim fallback. This includes funds unrelated to that redemption. | Sweep removed from the new Zest candidate. Production source has no mock fallback. Legacy adapter unchanged. |
| M-02 | Medium | v6 determines fees at exit, so fees may change after a user deposits. | v7 snapshots the entry fee and requires a maximum fee parameter at entry. |
| M-03 | Medium | v6 uses Stacks blocks for its delay; their duration differs from Bitcoin burn blocks. | v7 onboarding and fee proposals use 144 Bitcoin burn blocks. Tests show 500 Stacks blocks do not bypass the delay. |
| M-04 | Medium | Legacy oracle rotation retains old reports; duplicate identities and refreshing old agreeing pairs weaken intended freshness semantics. Uninitialized APY initially returns zero successfully. | Zest candidate enforces unique identities, deletes replaced reports, uses the oldest agreeing report's time, and rejects uninitialized consensus. |
| L-01 | Low | v6 adds untrusted deposit amounts before testing capacity, allowing arithmetic overflow instead of a typed error. | v7 checks the amount against remaining capacity using guarded subtraction. |
| L-02 | Low | A zero-recovery withdrawal attempts a zero token transfer, which may prevent closing the lost position. | v7 permits explicit acceptance with a zero payout minimum and omits the zero transfer. |

The detailed machine-readable review is in [security-review.json](security-review.json).

## Hermetica: concrete reproduction and sound resolution

The [published upstream source](https://api.hiro.so/v2/contracts/source/SP1S1HSFH0SQQGWKB69EYFNY0B1MHRMGXR3J1FH4D/vault-hbtc-v1-2?proof=0) declares permissionless `redeem` at line 140. Its internal redemption reads the recorded user at line 152, transfers net assets to that user at line 157, and deletes the claim at line 163. The recorded user is the pooled adapter. Source hash and exact locations are retained in [hermetica-source-evidence.json](hermetica-source-evidence.json).

The repository adapter unconditionally calls upstream `redeem` again in `claim-withdraw` ([adapter source](../contracts/adapters/hermetica-hbtc-adapter.clar), line 157). After an unrelated caller redeems the funded claim, both adapter claim and cancel paths fail because the upstream claim no longer exists. Several users' externally redeemed proceeds can accumulate at the same adapter address without a remaining authoritative allocation record.

[legacy-security-regression.test.ts](../tests/legacy-security-regression.test.ts) reproduces this sequence: deposit, request, fund, unrelated-caller redemption, deleted claim, failed user claim, failed cancellation, and a still-tracked user position. **This test passing means the defect is reproducible, not fixed.** It uses the existing accounting shim and does not establish real mainnet funding, cooldown, token movement, or blacklist behavior.

A full-balance sweep, a redemption preview taken at request time, or a later operator assertion cannot safely recover each user's exact amount. Funding determines the actual redemption value after the request, and the funded record can disappear before the adapter reads it. A sound replacement needs independently attributable escrow principals or an upstream persistent settled-claim receipt. The new [serialized Hermetica candidate](hermetica-v7/REVIEW.md) implements a separate solution: one outstanding upstream claim, blocked new deposits while pending, durable per-user receipt liabilities, explicit donation attribution and permissionless settlement. Its version-specific deletion-path proof, 19 local tests and remaining liveness limits are documented separately. It does not repair the immutable legacy adapter, and production release remains blocked.

## Validation completed

Run from `contracts/`:

| Command | Result | What it establishes |
|---|---|---|
| `npm test -- --silent` | 29 tests passed | Original v6/shim suite and the explicitly unresolved Hermetica regression. |
| `npm run test:v7` | 31 tests passed | New vault accounting, admission, governance, atomic rollback and adversarial token/callback cases. |
| `npm run test:v7:report` | 31 tests passed; cost and coverage output generated | 190/199 executable vault lines (95.48%) and 37/57 branches (64.91%) covered. |
| `npm run test:v7:adapters` | 5 tests passed | Zest candidate caller binding, initial pause and oracle consensus/freshness behavior; no external protocol lifecycle proof. |
| `npm run test:hermetica:v7:report` | 19 tests passed | New Hermetica candidate token-moving local model; 600 additional seeded actions and H-01 recovery. Not a real-source fork. |

The deterministic sequence fuzzer executes **800 actions across four recorded seeds**, three wallets and two token-moving mock strategies. It varies deposits, repeated entries, requests, cancellations, loss/profit redemption, rejected minimum payouts and successful exits. After each transition it compares the model's position states and counters, realized fee inventory, user payouts, and conservation of all minted tokens. Separate tests check 24 combinations of fee rates and values at the uint128 boundary.

Adversarial tests cover wrong tokens, `(ok false)` token transfers at entry and payout, dishonest adapter gross amounts, donated vault funds, and a real attempted vault callback. Clarity rejects the circular call before it can reenter; the test verifies no token movement or residual position. The lock remains defense in depth. Nine uncovered vault functions are simple read accessors; unexecuted branches and the finite fuzz space remain limitations. Full results and method cost maxima are in [v7-validation.json](v7-validation.json). Mock-integration costs do not predict real external strategy costs.

## Reproducible unit-test environments

`Clarinet.legacy-simnet.toml` uses an isolated `.cache-legacy-simnet` directory. `pretest` copies both tracked Zest and Hermetica accounting fixtures there, including metadata. It has no canonical mainnet sBTC dependency. The legacy tests use the environment-provided simnet instance so they respect this manifest. The candidate Zest oracle analysis reuses only the tracked Zest shim and does not require live protocol downloads.

`Clarinet.v7.toml` uses only local contracts and deterministic mock strategies. It includes adversarial fixtures that must never be released. `Clarinet.v7-testnet.toml` contains only the seven-contract testnet bundle: three traits, the vault, mock sBTC, and two mock adapters. Both are independent of remote protocol state. Compatible dependency patches were applied, followed by a controlled upgrade to pinned Vitest 4.1.11. The dependency lockfile is updated and the Clarinet major version is unchanged.

Neither accounting shim is evidence of a real protocol integration. Mainnet fork tests remain a separate release gate; tests that catch unsupported VM behavior or skip an actual claim cannot be counted as passing that lifecycle.

## Dependency review

A registry audit initially reported seven dependency findings, including one critical and three high findings. Compatible patches reduced this to two moderate findings in the Vitest/mocker chain. A controlled upgrade to **Vitest 4.1.11**, tested with `vitest-environment-clarinet` 2.6.0, eliminates those remaining findings: the final registry audit reports **zero known vulnerabilities**. The original 65 retained tests and 19 added Hermetica candidate tests passed with this installed dependency set (84 total). [Dependency audit details](dependency-audit.json) record the progression. No force install or dependency overrides were used.

The updated pool configuration shares one worker environment so Clarinet can accumulate complete cost and coverage reports under Vitest 4. Clarinet still resets the blockchain before each individual test. The final report contains all 31 named v7 test records and all three test files. The upstream environment's `transformMode` produces a deprecation warning but remains supported in the pinned version; no future major-version compatibility is claimed. Node dependency advisories are separate from the unresolved Clarity findings above.

## Remaining trust and release gates

1. **Wallet confinement:** approved adapters receive the original user `tx-sender` and can attempt arbitrary calls. The vault does not turn a malicious approved adapter into a safe contract. Wallet transactions must enforce exact token identity and exact total spending with Deny postconditions. Review adapter source and all mutable upstream dependencies before onboarding.
2. **Asset and governance:** the owner selects the asset once and controls deposit pause, onboarding proposals, future fees, and caps. Production needs reviewed multisignature custody and operational procedures. The global cap can be increased immediately; per-adapter cap increases require delayed approval. Rejecting or pausing new deposits preserves existing exits.
3. **External economic risk:** protocol exploits, insolvency, governance changes, censorship, custody, liquidity and redemption delays remain possible. Neither v7 nor a quoted APY guarantees principal or yield.
4. **Oracle recovery:** the Zest candidate deliberately rejects a greater-than-50% rate deviation. A genuine abrupt drop, including to zero, may stop new deposits after expiry. This needs an explicit audited recovery procedure; inventing intermediate rate reports is unacceptable.
5. **Actual integrations:** exact-source funded Zest, StackingDAO and replacement Hermetica fork proofs are now recorded in the [validation summary](../../docs/validation/REBUILD-VALIDATION.md). Fork mutations remain local; they do not prove all market/liquidity states or public deployment readiness. Hermetica uses serialized claims with a documented liveness tradeoff, and its upstream public deposits remain disabled. Native BTC, PoX-5, Babylon and Lombard have separate bounded preparation clients and incomplete public execution gates; Solv remains a handoff.
6. **Public testnet:** canonical sync/async mock lifecycle receipts now pass after the real onboarding delay. The separate fee-snapshot campaign awaits the second real delay, to burn block 22731. Its profit withdrawal, fee collection and accepted-loss stages remain incomplete. See the retained journal; local mining is not a substitute.
7. **Mainnet:** obtain independent external audit/remediation and deployment hash review. Existing v6 users must explicitly exit and redeposit; v7 cannot change live v6 state or silently migrate their assets.
