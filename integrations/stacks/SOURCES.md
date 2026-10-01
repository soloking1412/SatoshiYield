# Source provenance

Files in `sources/` are exact immutable public mainnet contract source snapshots fetched from the Stacks node source endpoint. They are provided for verification, not modification or deployment. `manifests/mainnet.json` records source URLs, SHA-256 digests, publish heights, ABI paths, official GitHub commit references, and observed network height. Official repository licensing and attribution remain applicable:

- [Zest Protocol](https://github.com/Zest-Protocol/zest-v2-contracts)
- [StackingDAO](https://github.com/StackingDAO/stackingdao-smart-contracts)
- [sBTC](https://github.com/stacks-network/sbtc)

A byte mismatch with a repository file is retained in the manifest. The two older StackingDAO tracking files differ in final newline bytes; their line content matches. Runtime checks use the exact on-chain byte hash, not a normalized repository hash. A source match does not eliminate governance, signer, market, or liquidity risk.

Upstream license texts are retained under `licenses/`: Zest and StackingDAO MIT licenses at the pinned repository commits, and the sBTC repository GPL-3.0 license with its immutable Git blob identifier. These source snapshots retain their respective upstream licenses; the integration does not relicense them.
