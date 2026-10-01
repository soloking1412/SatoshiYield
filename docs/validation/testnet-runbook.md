# v7 public testnet verification runbook

This is a restartable verification campaign for the frozen `vault-v7` deployment and its **mock** token and adapters. It does not validate Zest, Hermetica, Bitcoin staking, production liquidity, external counterparties, or real yield. It does not make the candidate production ready.

The runner never shortens the 144 Bitcoin burn-block governance delay. Adapter proposals became eligible at burn block **22557** and both were activated. The full sync/async lifecycle, cancellation, and unfunded-claim rejection have canonical passing receipts. The economics campaign has entered its profit position with a 500-bps fee snapshot and scheduled a 300-bps fee; that proposal becomes eligible at burn block **22731**. The node’s current burn height determines readiness; a wall-clock estimate is not an authorization to activate.

## Scope and artifacts

Run commands from the repository root with the existing `contracts` dependencies installed:

```sh
node contracts/testnet-runner.mjs status
node contracts/testnet-runner.mjs preflight
```

The report’s `progress` fields distinguish passed phases from waiting, incomplete, and not-started phases. An expected rejection or a submitted transaction never automatically marks a lifecycle complete. Receipt lookup failures invalidate current canonical assertions, are persisted even when the command fails, and move a previously passed phase to `receipt-reverification-required` until its receipts can be verified again. Historical state snapshots remain timestamped evidence of their original observation.

`status` and `preflight` are read-only against the network and do not load the signing key. They update public evidence files locally. Other modes require the existing dedicated testnet credential; the runner reads only the configured private wallet file and never prints its contents. It accepts only a valid testnet identity, a node reporting testnet chain ID `0x80000000`, and serialized testnet transactions with deny-mode postconditions.

Public evidence:

- `docs/validation/testnet-v7.json`: transaction IDs, nonces, exact expected results, canonical receipts, state assertions, and lifecycle evidence.
- `docs/validation/testnet-preflight.json`: source comparisons, bootstrap receipt checks, complete baseline reads, and each proposal’s remaining burn blocks.
- `docs/validation/testnet-source-verification.json` and `testnet-initial-state.json`: earlier point-in-time observations, retained for context.

No private key or signed transaction bytes are written to these reports. Exact signed bytes are retained in the credential directory, with restrictive permissions, solely for recovery of an uncertain submission.

## What preflight establishes

Preflight verifies the following before activation:

1. All seven deployment transactions and four initialization transactions have canonical successful receipts from the expected address and nonce.
2. Each deployed source SHA-256 equals both the originally submitted source hash and the current working-tree source hash.
3. The vault is bound to this deployment’s `mock-sbtc`, owned by the expected account, has that account as fee collector, is paused, and still uses a 144 burn-block governance delay.
4. Both adapter configurations are absent, both pending proposals have the expected kind and cap, and no fee/collector change is pending.
5. Recorded principal, fee balance, adapter exposures, shares, outstanding positions/claims, and contract token balances are zero. The account holds the originally minted 10,000,000 mock units.
6. Current burn height, earliest activation height, and remaining burn blocks are recorded for each proposal.

Preflight separately compares sources with `git HEAD`. Until candidate files exist in a commit, that attestation is **incomplete**, and the report’s overall result is `partial`, even when every on-chain baseline and working-tree check passes. It never calls an uncommitted working-tree match a committed-source match. A conflicting committed source fails verification even if other candidate sources remain uncommitted. A failed functional check exits nonzero. A partial commit attestation is recorded explicitly and does not manufacture a failed contract result.

After activation, the initial-state preflight is expected to fail its paused/unapproved assertions. Use `status` and the lifecycle evidence for the later phases rather than treating a later active state as an initial baseline.

## Negative checks before maturity

```sh
node contracts/testnet-runner.mjs negative
```

Re-run the same command after the submitted transaction is canonically included. Each invocation sends **at most one new transaction** and never sends a dependent operation before confirming the prior result.

This mode deliberately broadcasts two bounded testnet transactions:

- Premature `apply-adapter` must be canonical `abort_by_response` with `(err u110)`. The runner refuses to start this test within six burn blocks of maturity, avoiding a boundary race that could unintentionally enable an adapter.
- A default unapproved `deposit` must be canonical `abort_by_response` with `(err u107)`. The contract checks adapter registration before the paused assertion, so this baseline does not independently demonstrate `(err u101)`.

These expected errors count as **passed rejection tests**, not successful deposits. The negative deposit uses an exact zero-transfer postcondition, so an accidentally successful transfer would still roll back. A later invocation verifies unchanged mock-token balances, supply, accounting, proposals, and absence of positions before recording the negative phase as passed. Failed transactions still consume their test STX network fee. The runner does not describe those fees as unchanged balances.

An earlier deposit experiment with an exact nonzero-spend postcondition returned `(err u107)` but was classified `abort_by_post_condition`, because the rolled-back transaction sent zero tokens. That original failed expectation is preserved, with verified rollback, and superseded by the separately labeled `negative:unapproved-deposit-no-transfer` case. It is not silently rewritten as a successful original test.

This implementation does not assume that a public transaction can be simulated through the node’s read-only endpoint. That endpoint is used only for declared read-only functions; the negative evidence comes from actual canonical testnet receipts.

## Activate only after the real delay

```sh
node contracts/testnet-runner.mjs activate
```

Before broadcasting either adapter application, the runner reads **both** outstanding proposals and rejects the command if either is immature. It also verifies the frozen deployed sources. The workflow then proceeds one confirmed transaction at a time:

1. Apply the synchronous mock adapter; verify its enabled configuration and consumed proposal while the vault remains paused.
2. Apply the asynchronous mock adapter; verify the same properties.
3. Unpause only after both adapter applications are confirmed and the vault remains empty.

Re-running the command while immature produces a clear error and broadcasts nothing. Re-running while a prior transaction is pending waits for that existing transaction. No timelock, fixture, or contract source is modified.

## Exercise the complete mock lifecycle

```sh
node contracts/testnet-runner.mjs exercise
```

Run this command again after each reported pending transaction becomes canonical. It records a baseline once and resumes from the first unfinished step:

| Step | Required result | Verified state |
| --- | --- | --- |
| Deposit 100,000 mock units into sync adapter | `(ok u100000)` | Exact position/share/exposure/token increases; account decreases by the same amount |
| Withdraw sync position | `(ok u100000)` | Position removed, counters zero, principal restored |
| Deposit 100,000 mock units into async adapter | `(ok u100000)` | Exact async position and isolated adapter exposure |
| Request async withdrawal | `(ok u1)` | Pending position and matching claim ID |
| Cancel while unfunded | `(ok true)` | Active position restored; claim cleared; balances unchanged |
| Request withdrawal again | `(ok u2)` | A new matching claim ID, without a duplicate deposit |
| Attempt an unfunded claim | `(err u125)` with `abort_by_response` | Pending position and all balances unchanged |
| Mark fixture claim funded | `(ok true)` | Pending claim and balances remain consistent |
| Claim redemption | `(ok u100000)` | All positions, claims, exposures, shares, contract token balances and fee counters zero; initial principal restored |

The funding step toggles the mock adapter’s settlement flag. It does not test an external protocol’s ability to fund redemptions and does not mint a profit. Final zero fees are expected because the fixtures return principal at a 100% payout setting; this particular public-network campaign does not prove fee-on-profit or loss handling.

Exact outgoing token postconditions cover the account, adapter, and vault as appropriate. Account application-level STX transfers are constrained to zero, separately from the explicit one-test-STX transaction fee. A state mismatch, wrong response, postcondition abort, unexpected sender, or noncanonical receipt stops progression.

## Economics: profit, fee snapshots, and an accepted partial loss

This separate mode requires the complete mock lifecycle and preserves its historical baseline/final evidence:

```sh
node contracts/testnet-runner.mjs economics
```

**Do not run it before activation and lifecycle completion.** The mode itself refuses to start economics transactions without recorded completed lifecycle evidence. Like the other state machines, it submits at most one new transaction per invocation and verifies that transaction and its resulting state before proceeding.

The fee-snapshot test introduces a **second real 144-burn-block governance wait**. The runner never applies the lower fee early. While waiting it writes `evidence.economics.status: "waiting"`, `waitingFor: "fee-timelock"`, the earliest burn block and remaining burn blocks. A waiting state is not a passed economics test.

| Stage | Required result and evidence |
| --- | --- |
| Configure profit payout | Set the frozen synchronous fixture to 11,000 payout basis points |
| Seed bounded profit reserve | Mint exactly 10,000 mock units to the sync adapter; verify supply increases by exactly 10,000 |
| Enter the profit position | Deposit 100,000; verify recorded shares/principal and the **500-bps entry fee snapshot** |
| Schedule a lower current fee | Propose 300 bps after entry; record the returned earliest activation burn block |
| Wait and apply | Wait the real 144 burn blocks, apply 300 bps, then verify current fee is 300 while the existing position still records 500 |
| Withdraw profit | Gross 110,000; profit 10,000; entry-snapshot fee **500**; net payout **109,500**. Exact outgoing postconditions and balances must agree |
| Collect fees | Transfer exactly 500 from the vault to the configured collector, which is the campaign account; verify both accrued fee accounting and vault tokens return to zero |
| Configure loss payout | Set the sync fixture to 9,000 payout basis points |
| Enter the loss position | Deposit 100,000; verify its entry fee is now 300 and its redemption quote is 90,000 |
| Reject an excessive minimum | Withdrawal with minimum 100,000 must return exactly `(err u123)` and preserve position, shares, balances, fees, and supply |
| Accept the explicit loss | Withdrawal with minimum 90,000 must return `(ok u90000)`; record a 10,000 principal shortfall, zero performance fee, and cleared position/exposure/share counters |

A slippage-rejected withdrawal can include rolled-back attempted transfers before returning an error. Its predeclared accepted failure classifications are `abort_by_response` or `abort_by_post_condition`, but **the exact contract result must still be `(err u123)`**, and all state/balance rollback assertions must pass. An `(ok ...)` response masked only by a postcondition cannot pass this test.

The frozen loss fixture retains the unpaid **10,000 mock tokens** in the sync adapter. It does not burn them or transfer them to an external venue. The runner records this residual explicitly and does not invent a cleanup transaction. At the end of this exact campaign, supply is 10,010,000, the campaign account holds its original 10,000,000, the sync adapter holds 10,000, the vault and async adapter hold zero, and all position/share/exposure/fee counters are zero. The account’s net change is zero because the deliberately seeded 10,000 profit and separately accepted 10,000 shortfall offset; this is not evidence that principal is protected.

Completion is recorded only as `evidence.economics.status: "passed"` and `passed: true` after the final state reconciles. The mock reserve mint demonstrates fee accounting, not real yield generation. The lower current fee remains 300 bps, and the fixture retains its 90% payout setting; those deliberate test-state changes are part of the final evidence.

## Restarts and uncertain submissions

A process lock prevents concurrent runners from racing over the same nonce/report. The runner writes the transaction identity and exact signed bytes **before** broadcasting. It does not infer that a lost HTTP response means the transaction was not sent, and it does not create a new nonce automatically for retries.

For an uncertain or dropped transaction:

```sh
node contracts/testnet-runner.mjs status
node contracts/testnet-runner.mjs retry 'exact:recorded-label'
```

`retry` only re-broadcasts the same signed bytes and transaction ID after rechecking the network and nonce. It does nothing for a known pending transaction. If the nonce has already been consumed, it stops for investigation. Historical entries created by the older runner may not have a saved signed payload; that absence blocks automatic retry rather than generating an unsafe replacement.

A canonical transaction with an unexpected result is not retried as though it never happened. Preserve the evidence, inspect the failure, and use a separately planned deployment/campaign if remediation requires new contracts. Do not delete transaction rows to make a failed run look complete.

## Completion criteria

Only report the lifecycle phase as complete when `evidence.exercise.passed` is true, every lifecycle transaction is canonical with its exact expected result, and its recorded final state proves principal restoration and zero residual positions/counters. The extended economics campaign additionally requires `evidence.economics.status` to be `passed`, the fee-change snapshot proof, explicit minimum rejection/accepted loss, and the precisely reconciled residual described above. Until then, report the exact completed steps and the remaining blocker.

Even a complete campaign establishes only these mock flows on Stacks testnet. Independent review, production adapter verification, adversarial tests, operational controls, and real integration evidence remain separate release requirements.

## Committed release-source attestation

After the deployed source files are committed, run `node scripts/attest-testnet-sources.mjs`. This separate read-only command validates the exact seven deployment records, canonical testnet context and each source against its submitted hash, deployment transaction, current working tree and one stable Git commit. It writes `testnet-release-source-attestation.json` and reads no credential. It works after activation without reasserting the old empty/paused baseline. The first committed attestation passed at `4ec2e0a`; historical initial-state/preflight records remain unchanged.
