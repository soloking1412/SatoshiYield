#!/usr/bin/env node
/**
 * Build-time guard. Vite doesn't execute modules during `vite build`, so the
 * runtime `throw new Error(...)` calls in lib/stacksClient.ts and
 * constants/contracts.ts only fire in the browser — too late if a bad bundle
 * has already been pushed to Vercel.
 *
 * This script runs before `tsc -b && vite build` and fails the build process
 * with exit code 1 if the env is misconfigured.
 */

const network = process.env.VITE_NETWORK;
const deployer = process.env.VITE_DEPLOYER_MAINNET;

const errors = [];

if (network !== "mainnet") {
  errors.push(
    `VITE_NETWORK must be "mainnet" (got ${JSON.stringify(network)}). ` +
      "Mainnet-beta only ships mainnet builds."
  );
}

if (!deployer || deployer === "REPLACE_WITH_MAINNET_DEPLOYER") {
  errors.push(
    `VITE_DEPLOYER_MAINNET must be the Asigna multi-sig address (got ${JSON.stringify(deployer)}).`
  );
} else if (!/^SP[A-Z0-9]{38,39}$/.test(deployer)) {
  errors.push(
    `VITE_DEPLOYER_MAINNET "${deployer}" does not look like a Stacks mainnet principal (must start with SP).`
  );
}

if (errors.length > 0) {
  console.error("\n[check-env] Build refused:");
  for (const e of errors) console.error("  - " + e);
  console.error("");
  process.exit(1);
}

console.log(
  `[check-env] OK: network=${network} deployer=${deployer.slice(0, 14)}…`
);
