// Applies tracked simnet shims into Clarinet's requirement cache before tests.
//
// The hermetica-hbtc-adapter calls the real mainnet hBTC vault by hardcoded
// principal. The real contract's multi-contract state cannot be initialised in
// simnet, so for unit tests we replace the cached requirement with a tracked,
// self-contained pure-accounting shim (mirrors the existing Zest shim approach).
// The real contract is validated separately via a mainnet fork before approval.
//
// Run automatically via the `pretest` npm script. Idempotent.

import { mkdirSync, copyFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const cacheDir = join(here, "..", "..", ".cache", "requirements");

// contract-id -> tracked shim file
const SHIMS = {
  "SP1S1HSFH0SQQGWKB69EYFNY0B1MHRMGXR3J1FH4D.vault-hbtc-v1-2": "vault-hbtc-v1-2.clar",
};

// hBTC dependency contracts that the real vault pulls in but the shim does not
// need — removed so they are not published into the simnet plan.
const ORPHANS = [
  "SP1S1HSFH0SQQGWKB69EYFNY0B1MHRMGXR3J1FH4D.state-hbtc-v1",
  "SP1S1HSFH0SQQGWKB69EYFNY0B1MHRMGXR3J1FH4D.reserve-hbtc-v1",
  "SP1S1HSFH0SQQGWKB69EYFNY0B1MHRMGXR3J1FH4D.hq-v1",
  "SP1S1HSFH0SQQGWKB69EYFNY0B1MHRMGXR3J1FH4D.blacklist-v1",
  "SP1S1HSFH0SQQGWKB69EYFNY0B1MHRMGXR3J1FH4D.token-hbtc",
  "SP1S1HSFH0SQQGWKB69EYFNY0B1MHRMGXR3J1FH4D.fee-collector-hbtc-v1",
  "SP1S1HSFH0SQQGWKB69EYFNY0B1MHRMGXR3J1FH4D.vault-trait-v1",
  "SP1S1HSFH0SQQGWKB69EYFNY0B1MHRMGXR3J1FH4D.sip-010-trait",
];

const META = JSON.stringify({ epoch: "Epoch32", clarity_version: "Clarity3" }, null, 2);

mkdirSync(cacheDir, { recursive: true });

for (const [contractId, shimFile] of Object.entries(SHIMS)) {
  copyFileSync(join(here, shimFile), join(cacheDir, `${contractId}.clar`));
  writeFileSync(join(cacheDir, `${contractId}.json`), META);
  console.log(`[shims] applied ${shimFile} -> ${contractId}`);
}

for (const id of ORPHANS) {
  for (const ext of ["clar", "json"]) {
    const f = join(cacheDir, `${id}.${ext}`);
    if (existsSync(f)) {
      const { rmSync } = await import("node:fs");
      rmSync(f);
    }
  }
}
console.log("[shims] done");
