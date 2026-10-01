#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { accessSync, constants } from "node:fs";
import { fileURLToPath } from "node:url";

// Vercel builds from frontend/, but its imports include sibling packages.
// Resolve from this file so installation never depends on the caller's cwd.
const repository = new URL("../../", import.meta.url);
const packages = [
  { path: "frontend", source: "src/App.tsx" },
  { path: "integrations/stacks", source: "src/index.mjs" },
  { path: "integrations/bitcoin", source: "src/index.ts" },
  { path: "integrations/pox5", source: "src/index.mjs" },
];
const npm = process.platform === "win32" ? "npm.cmd" : "npm";

function run(args, directory, label) {
  console.log(`[workspace-install] ${label}`);
  const result = spawnSync(npm, args, { cwd: directory, stdio: "inherit" });
  if (result.error) throw new Error(`${label}: ${result.error.message}`);
  if (result.status !== 0) {
    throw new Error(`${label} failed (${result.signal ? `signal ${result.signal}` : `exit ${result.status ?? "unknown"}`}).`);
  }
}

try {
  if (Number(process.versions.node.split(".")[0]) !== 24) {
    throw new Error(`Node 24 is required by the pinned build toolchain; received ${process.version}.`);
  }

  // Check the complete checkout before npm ci removes any package directory.
  const missing = [];
  for (const pkg of packages) {
    for (const file of ["package.json", "package-lock.json", pkg.source]) {
      const relative = `${pkg.path}/${file}`;
      try { accessSync(new URL(relative, repository), constants.R_OK); }
      catch { missing.push(relative); }
    }
  }
  if (missing.length) {
    throw new Error(
      `Incomplete frontend workspace: ${missing.join(", ")}. ` +
      "This build requires frontend/ and sibling integrations/{stacks,bitcoin,pox5}/ in the same repository checkout. " +
      "Ensure the hosting root-directory configuration includes files outside frontend/. " +
      "No dependencies have been installed."
    );
  }

  for (const pkg of packages) {
    run(
      ["ci", "--ignore-scripts", "--include=dev", "--no-audit", "--no-fund"],
      fileURLToPath(new URL(`${pkg.path}/`, repository)),
      `Installing locked dependencies in ${pkg.path}`,
    );
  }
  run(["run", "build"], fileURLToPath(new URL("integrations/bitcoin/", repository)), "Building Bitcoin integration");
  console.log("[workspace-install] Frontend workspace ready. No contracts or network transactions were deployed.");
} catch (error) {
  console.error(`[workspace-install] ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
