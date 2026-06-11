# hBTC mainnet-fork test

A standalone Clarinet project that validates `hermetica-hbtc-adapter`'s assumptions
against the **real** Hermetica hBTC contracts on Stacks mainnet, using Clarinet's
remote-data forking (`[repl.remote_data]` in `Clarinet.toml`, pinned to a mainnet
block height). It is intentionally separate from the main contracts suite (which
uses a pure-accounting shim).

## Run
```
cd contracts/fork-test
cp settings/Devnet.toml.example settings/Devnet.toml   # standard public devnet mnemonics
npx vitest run                                          # uses the parent node_modules
```
(Each call hits the Hiro API, so the run takes ~45s.)

## What it proves (against the REAL contracts)
- Real read interface: share price (~1.016), 3-day cooldown, exit-fee (0 today),
  deposit-cap, min-deposit.
- A real `deposit` returns shares at the real share price.
- A real `request-redeem` escrows the shares and opens a claim.
- The real Hermetica manager's `fund-claim` auth + `process-claim` accounting run.

## Known fork limitation (root cause)
`fund-claim`'s final step calls `reserve-hbtc-v1.transfer`, which moves sBTC out
of the reserve via a Clarity-3.1 post-condition-scoped `as-contract?`:

```clarity
(as-contract? ((with-ft asset-contract "*" amount) (with-stx amount))
  (try! (contract-call? asset transfer amount current-contract recipient none)))
```

The remote-data **simulator** cannot evaluate that `with-ft` post-condition
against a lazily-fetched token contract (`UnionTypeValueError([…], UInt(0))`).
This is a SIMULATOR limitation — the construct is valid Clarity and runs on
mainnet; it is not a defect in our code or hBTC's. So the remote-data fork
validates everything up to (and including) the manager's `process-claim`
accounting, but cannot execute the reserve sBTC transfer or the subsequent
`redeem` payout.

The redeem/payout LOGIC (burn shares, send sBTC to the user, fee accounting, the
adapter forwarding its balance to the vault) is fully covered by the simnet shim
suite (`../tests/hermetica-hbtc-adapter.test.ts`). A complete real-ledger redeem
needs a full Stacks-node mainnet fork (chainstate snapshot) or a Hermetica
testnet deployment — recommended as part of the professional audit, not
achievable with the remote-data simulator alone.

See `.superstack/security-reports/SatoshiYields-v6-audit-2026-06-10.md`.
