The `pox-5.testnet.clar` file is the exact public testnet boot-contract source returned by:

https://api.testnet.hiro.so/v2/contracts/source/ST000000000000000000002AMW42H/pox-5?proof=0

SHA-256: `44a424364cb3c115ec92d0a72ebd228645e65d8f92792d66695898904e14c734`.

It is used only as the deterministic RPC source response for real SDK tests. Tests verify this hash before running; they do not replace hashing or SDK calls. This fixture does not simulate contract execution, establish a real allowance, or prove a Bitcoin inclusion proof. The source was retrieved on 1 October 2026 and preserves its published content.
