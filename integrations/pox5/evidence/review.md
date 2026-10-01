# PoX-5 preparation module — internal security review

Reviewed 1 October 2026. Scope: `src/index.mjs`, source pins and pinned `@stacks/bitcoin-staking` 7.6.0 behavior. This is an internal review with executable adversarial tests, not an external audit or authorization to fund a Bitcoin lock.

The module observes PoX-5 prerequisites, constructs a non-signing lock plan, and constructs an unsigned timelock recovery PSBT. Every returned plan retains `broadcastAllowed: false`, and observations/lock plans retain `fundingAllowed: false`. It has no signing or broadcast method. A successful modeled preflight is not evidence of a real allowance, ownership of the Bitcoin key, signer-manager acceptance, or an accepted registration/inclusion proof.

## Review findings and fixes

1. **Final script reads were not pinned or strictly decoded.** The initial implementation used a different transport for the final on-chain script comparison. The root implementation now reuses the fresh observation's private transport, checks the canonical tip, and rejects trailing/malformed Clarity data. Regression tests inspect the actual SDK fetch requests and exercise a trailing-byte response.
2. **Matching a constructed script did not establish the canonical bond unlock height.** The contract's pure script constructor accepts a supplied height. The implementation now separately reads `get-bond-l1-unlock-height` at the same tip, compares it with the SDK-derived height, and enforces the user's maximum. The installed SDK returns a bigint; the comparison normalizes types without rounding. An incorrect canonical height is rejected by a dedicated test.
3. **Recovery must survive a browser restart.** A session-local WeakSet cannot authenticate a saved recovery plan. Recovery now reconstructs all script/address bytes from the saved public parameters, matches the original transaction's txid, output index, value and script, and ignores serialized authorization flags. Valid JSON backups work; altered keys, owner, script, address, network, outpoints and outputs fail.
4. **SDK signer-grant decoding was too permissive for an unexpected `(ok false)`.** The published contract is expected to return `(ok true)`; the SDK treats any `ok` response as granted. The strict transport now rejects that malformed success shape. An executable regression covers it.
5. **Final asynchronous checks need an expiry check before returning the plan.** The test suite includes a delayed final script response that moves the clock beyond the quote lifetime. The final implementation checks freshness again after both reads. The delayed-response regression passes. This is separate from the always-disabled funding/broadcast state.

## Executable validation

Run `npm test` in `integrations/pox5`. Tests invoke the real SDK and inject deterministic RPC responses; no SDK or cryptographic hash functions are replaced. The exact public testnet PoX-5 source fixture is checked against its pinned SHA before use. Positive tests construct and decode an actual unsigned recovery PSBT to verify the input witness script, amount, output amount and locktime.

The suite covers strict integers/Clarity decoding, canonical chain/index hashes, wrong network, altered source, missing/disabled PoX-5, changing Bitcoin tip, allowance and bond absence, inadequate allowance or paired STX, active membership, missing signer/grant, preparation phases and deadlines, stale/copied observations, invalid/off-curve keys, maximum lock height, changed allowance/bond/signer data, mismatched canonical scripts/unlock heights, backup recovery, raw-transaction binding, wrong Bitcoin destination network, premature recovery, fee limits and dust. Testnet maps to Bitcoin **regtest**, and a mainnet destination is rejected.

All **26 tests pass** on the final formatted source; exact SHA-256, Node execution coverage and dependency audit results are recorded in [validation.json](validation.json). The dependency registry audit reports **zero known vulnerabilities**. These are mocked network tests. They do not execute a funded registration, signer-manager public validation, Bitcoin header/merkle proof, real Bitcoin spend, or consensus script validation of a completed signed reclaim.

## Remaining boundaries

- Live testnet evidence in `testnet-eligibility.json` shows the inspected wallet had no bond allowance; no BTC or STX commitment was broadcast. Fixture allowances are intentionally artificial test inputs and do not change that result.
- RPC responses are trusted for chain/state availability. Source hashes and canonical tip consistency detect mismatches but are not independent cryptographic verification of chain consensus or state proofs.
- A saved recovery plan and raw transaction establish internal script/outpoint consistency; they do not prove that the output is confirmed, remains unspent, or belongs to the wallet's available signing key. The caller-supplied current Bitcoin height must be independently verified before any future signing feature is enabled.
- Preparation does not prove that a signer manager accepts the intended registration, that the user owns the keys, or that a future registration meets deadlines. BTC can remain locked if registration fails; these are reasons funding remains disabled.
- Future funding/registration, rollover, early exit and signing need separate implemented checks, wallet review, provider permission and real lifecycle validation. This module does not claim them as completed flows.
