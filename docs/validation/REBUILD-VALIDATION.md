# Rebuild validation and release status

Date: 1 October 2026. Branch: `codex/secure-yield-rebuild`.

**This is an implemented and tested rebuild candidate, not a completed production release or an independent external audit.** The live website and mainnet vault were not modified, and no mainnet financial transaction was submitted. The distinction matters: passing mock tests, funded local forks, and public testnet checks establishes different things.

## Implemented application and core

- Additive `vault-v7` with separate user/adapter positions, global and strategy caps, a 144 Bitcoin burn-block admission delay, immediate-caller administration, direct user calls, frozen entry fees, user-approved share/payout limits, and exact redemption balance accounting. New deployments start paused. Existing exits survive deposit pauses and adapter revocation.
- Replacement Zest and Hermetica adapter candidates. Hermetica uses one outstanding upstream claim and durable per-user receipts to recover permissionless third-party redemption. That serialization has a documented liveness cost; it does not repair the legacy adapter.
- Rebuilt overview, strategy directory, vault data, portfolio, release/risk, and integration routes. Exact amounts, explicit missing/stale data, accessible dialogs, mobile layouts, protocol receipt holdings and a local transaction history replace fabricated yield/history and unsupported audit claims.
- Wallet calls bind to the reviewed sender and network. Session changes block dispatch. V7 testnet calls use Deny postconditions, exact asset identity, fresh admission checks and frozen reviewed fees/minimum payouts. Partial/total loss requires explicit consent. Legacy v6 exits disclose their weaker bounds.
- Transaction history separates pending, canonical success, confirmed failure and unavailable/mismatched observations. It validates the actual sender, contract, function, serialized arguments and result, and responds to later receipt changes. This is local-browser history, not a complete wallet index or a promise of Bitcoin finality.
- Read-only-by-default indexer with validated chain/network schemas, honest rate freshness, oracle writes disabled unless explicitly configured, bounded serialized test faucets and exact large-integer credential API responses.
- Locked dependency bootstrap and CI for contracts, application, indexer and integration clients. All six hosted GitHub Actions jobs passed for the core candidate at `4ec2e0a`; see [the hosted run](https://github.com/soloking1412/SatoshiYield/actions/runs/36836578717). Later build and validation tooling changes receive their own PR checks.

## Protocol capabilities and limits

| Route | Implemented and verified | Remaining execution/release boundary |
| --- | --- | --- |
| Zest current sBTC lending | Source-pinned direct deposit/redeem, user-owned receipt tokens, fresh quotes and Deny guards; funded direct and pooled-v7 real-state fork round trips | New v7 mainnet deployment/admission, independent audit and broader adverse market/liquidity validation |
| StackingDAO stBTC | Direct deposit, liquid reserve withdrawal, existing NFT claim, on-demand holdings; exact-source funded fork, including queued exit | New queue requests stay disabled without the reviewed guard deployed. Liquid exit fee has no upstream fee-cap parameter; the user's minimum payout is the bound |
| Hermetica hBTC | Replacement serialized adapter, durable receipts, 19 local model tests and funded real-contract third-party-redemption recovery | Public upstream deposits are disabled. The fork enables them only locally; no public onboarding is claimed |
| Native Stacks PoX-5 BTC | Official SDK, pinned canonical source, live bond/allowance eligibility, checked script/unlock parameters and saved-plan unsigned recovery preparation | Test wallet has zero public bond allowance and no signer manager. Funding, ownership/proof registration and completed staking remain disabled/unexecuted. Stacks testnet uses Bitcoin regtest, distinct from Signet |
| Babylon | Live Signet parameters/provider discovery, strict UTXO/script checks, unsigned stake and recovery PSBT preparation, reviewed fees/lock/slashing terms | Faucets require human challenge/login or are unavailable. No funded staking/registration/covenant/unbond lifecycle or BTC broadcast completed |
| Lombard | Official SDK sandbox quote, exact fee-authorization validation, account/chain binding, address verification workflow and independent Sepolia deployment checks | SDK catalog and transaction-resolver addresses differ. The sandbox authorization endpoint returns incomplete `{}`; the client blocks signing/address generation. No funded BTC→LBTC→BTC round trip |
| Solv and STX liquid stacking variants | Explicit official handoff/research and asset/custody distinctions | No claim of an executable in-app integration or comprehensive coverage of every Stacks protocol |

Direct Zest/StackingDAO calls go from the user's wallet to the protocol; they are separate from SatoshiYields vault positions. New **v7 vault** mainnet funding remains disabled by construction. Preparing a Bitcoin script, quote or unsigned transaction is not an active stake or completed bridge.

## Automated evidence

**All 428 tests passed: 84 contract, 151 frontend, 88 indexer, 27 Stacks integration, 52 Bitcoin integration, and 26 PoX-5 tests.** Both network frontend builds, the Bitcoin client build and the indexer build passed. The authoritative clean-install command results and test counts are in [clean-install validation](clean-install.json), with [frontend case results](frontend-tests.json). All seven package installations were recreated from lockfiles in a fresh directory, without copying existing dependencies or Clarinet caches. A preexisting local npm cache permission error was avoided with a separate task cache; no global permissions or dependencies were forcibly changed.

| Area | Scope |
| --- | --- |
| Legacy contract regression | 29 cases, including a passing reproduction of the **unresolved legacy** Hermetica defect |
| V7 vault | 31 cases; 800 state transitions over four deterministic seeds, token conservation, rollback, hostile adapters/tokens, fees and uint128 boundaries |
| Zest adapter model | 5 caller/oracle/admission cases, separately complemented by the real-state pooled fork |
| Hermetica replacement | 19 cases, including 600 seeded transitions, durable entitlement and donation/concurrent-user isolation |
| Stacks client/guard | 27 cases; 128 actual guard fee/minimum/wait combinations and 2,048 uint128 payout-rounding checks |
| Bitcoin client | 52 cases, including 100 real SDK stake-plan property cases and 500 amount cases |
| PoX-5 client | 26 cases covering real SDK scripts, canonical response validation, parameter rotation, height/fee limits and restored-plan recovery |
| Frontend/indexer | Full clean-install results below; parsing, wallet races, stale/failing reads, reviewed bounds, history states, accessibility and API/faucet policy |

The amount parser also performs 2,000 deterministic uint128 round trips. V7 executable line coverage is 190/199 (95.48%), with 37/57 branches (64.91%). Hermetica replacement line coverage is 92.98%, branch coverage 52.21%. Finite fuzzing is not exhaustive verification. [Contract review](../../contracts/reports/SECURITY-REVIEW.md) records findings and scope; an internal agent review is not an external professional audit.

[Dependency scans](dependency-audit.json) found zero known advisories in six packages. The Bitcoin/Lombard package retains **nine low-severity dependency findings from one upstream elliptic advisory** through the required LayerZero/ethers 5 chain. No compatible published fix was identified; a breaking downgrade was not forced. The frontend loads that package lazily, so the clean frontend-only scan does not erase the integration's findings. Registry scans do not establish the absence of unknown defects.

## Funded real-contract forks

These experiments read canonical mainnet state and execute mutations **only inside local fork VMs** using Clarinet SDK 3.24.1 at epoch 4.0. They use an existing funded sBTC holder; no mainnet keys or broadcasts are involved.

- [Zest/StackingDAO direct routes](../../integrations/stacks/evidence/mainnet-fork.json), pinned block 9101400: Zest 100,000 sats → 99,940 shares → 99,999 sats. StackingDAO 100,000 sats → 99,790 shares → 99,000 sats through idle exit (999-sat fee plus rounding); a separate queued position waits 4,200 locally mined burn blocks and claims 99,999 sats, burns its NFT and leaves no guard custody. Wrong minimum and missing receipt-burn conditions reject and roll back.
- [Pooled Zest v7](../../integrations/stacks/evidence/vault-mainnet-fork.json), same pinned block: exact vault and adapter source, two users, each 100,000 sats → 99,940 shares → 99,999 sats. Minimum-share/payout rejection, missing burn-condition rollback and paused exits pass. Donated 37 sats at the adapter and 73 at the vault remain untouched; both positions and all booked principal clear.
- [Hermetica replacement](../../integrations/hermetica/evidence/mainnet-fork.json), pinned block 9101467: public deposit-disabled behavior first rejects with rollback. The real governance owner is impersonated **locally only** to enable the lifecycle scenario. 100,000 sats → 98,041 hBTC shares; request/cancel/re-request; actual timestamp cooldown advances locally; a stranger funds and redeems upstream, deleting the claim; the adapter recovers a durable 99,999-sat entitlement and pays the user. Premature settlement and excessive minimum fail without losing the receipt. Public upstream state is unchanged.

These are bounded scenarios, not simulations of every liquidity crisis, upgrade or market loss.

## Public testnet: completed and waiting

The dedicated Stacks test wallet is **`ST1RHTNPSR0SX6SZC4ZGCPH5W8XS0MRT25NW98QDX`**. A faucet supplied 500 test STX. Its credential is outside the repository with owner-only directory/file permissions. Separate external test identities are likewise private; reports contain public addresses only.

Seven contracts have canonical successful deployment receipts: three traits, `vault-v7`, `mock-sbtc`, `mock-sync-v7`, and `mock-async-v7`. Their deployed hashes match the submitted and local sources. Frozen vault SHA-256:

`96d712ca4f75376280b6d22565eef9df0180c57287b3d9b57ef3f88dd1cdfdf3`

After the genuine first governance delay, both adapters were activated and the public mock lifecycle passed: sync deposit/withdraw, async deposit/request/cancel/re-request, rejected unfunded claim, fixture funding, and successful claim. State assertions establish restored principal, removed positions and zero booked exposure/fees at lifecycle completion. Early adapter application and unapproved deposit also have canonical expected-error receipts. An earlier misconfigured postcondition experiment is retained as a failed expectation, not rewritten into a pass.

**The separate economics campaign is waiting for Bitcoin burn block 22731.** It has configured a 110% mock payout, seeded exactly 10,000 mock units, entered a 100,000-unit position with a 500-bps fee snapshot, and scheduled a lower 300-bps fee. Application of that fee, proof that the existing position still pays the old fee, fee collection and explicit partial-loss checks remain pending. The runner does not shorten the delay or fast-forward the public chain.

Use [the restartable runbook](testnet-runbook.md) and [canonical journal](testnet-v7.json). Every mutation is bounded to one new transaction per invocation, rechecks network/source/state, and persists exact signed bytes privately before submission. Uncertain submissions retry only the same bytes. [Committed source attestation](testnet-release-source-attestation.json) subsequently passed for all seven contracts at `4ec2e0a`: submitted, deployment-transaction, published, working-tree and committed source hashes all match. The older preflight remains a historical partial result; it is not silently rewritten. Reproduce this read-only check with `node scripts/attest-testnet-sources.mjs`.

[Inspect the public testnet vault](https://explorer.hiro.so/address/ST1RHTNPSR0SX6SZC4ZGCPH5W8XS0MRT25NW98QDX.vault-v7?chain=testnet). Mock units have no monetary value and do not demonstrate real yield.

External funding attempts are documented in [faucet evidence](../../integrations/bitcoin/reports/faucet-attempts.json). The official Signet faucet requires a human CAPTCHA; no challenge bypass occurred. A pending human claim is not counted as funding. The [PoX-5 live report](../../integrations/pox5/evidence/testnet-eligibility.json) records zero allowance. [Lombard evidence](../../integrations/bitcoin/reports/lombard-address-registration.json) records the upstream authorization block, zero transaction broadcasts and no accepted deposit address.

## Browser and operational limits

See [independent browser review](ui-rebuild-review.md) for desktop/tablet/mobile, keyboard focus, live direct holdings/quotes, PoX-5 eligibility, public transaction receipts and failure-state coverage. Public wallet providers used in automated browser checks expose addresses/read RPC only; no mainnet signature or transaction was requested. This does not replace a real wallet-extension end-to-end signing campaign. A discovered Escape-focus issue was fixed and regression-tested. Mainnet/testnet development previews now use separate optimizer caches.

The earlier [mainnet snapshot](mainnet-snapshot.json) remains a timestamped observation: v6 and legacy Zest source identity, 14,353 sats booked principal, 5,000,000-sat cap, 500-bps fee and stale APY. The configured legacy Hermetica adapter was absent/unapproved at that block. No current NAV, guaranteed yield or safety certification is inferred from these readings.

Required before a full production release: finish the real public delay/campaign; secure protocol-specific eligibility, funding and partner environments; complete remaining Bitcoin signing/proof/registration and end-to-end recovery flows; deploy/review the StackingDAO queue guard; test actual wallet extensions; obtain an independent audit of the exact release and remedy findings; establish multisignature administration, monitoring, incident response and voluntary v6 migration procedures. Mainnet deployment and live-site publishing remain separate actions.

## Reproduction

Use Node 24 and `node scripts/bootstrap-rebuild.mjs`. The bootstrap installs all seven lockfiles, builds the Bitcoin client, and copies documented **public** local-fork wallet fixtures only when absent. Follow the per-package scripts and integration guides for unit suites, source verification and remote forks. Do not put signing credentials in `VITE_*` variables.

The hosting installer also has [separate clean production-mode validation](vercel-workspace-build.json): it installs the frontend and its three sibling clients from their lockfiles, rebuilds Bitcoin output, and fails before installation if the monorepo checkout is incomplete. The original automatic Vercel preview failed on missing sibling dependencies; this fix addresses the confirmed build log. Font policy now permits only the Google stylesheet/font origins already used by the interface.

Development previews: `http://127.0.0.1:5173` for mainnet reads/direct routes and `http://127.0.0.1:5174` for mock testnet. These are local services, not a published release.
