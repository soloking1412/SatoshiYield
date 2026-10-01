import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { copyFileSync, existsSync } from "node:fs";
const root = fileURLToPath(new URL("../", import.meta.url));
if (Number(process.versions.node.split(".")[0]) !== 24)
  throw new Error("Use Node 24 for the pinned rebuild toolchain.");
const npm = process.platform === "win32" ? "npm.cmd" : "npm";
for (const folder of [
  "integrations/stacks/fork/settings",
  "integrations/stacks/guard-unit/settings",
  "integrations/hermetica/fork/settings",
]) {
  const destination = `${root}${folder}/Devnet.toml`;
  if (!existsSync(destination)) copyFileSync(`${destination}.example`, destination);
}
for (const pkg of [
  "contracts",
  "indexer",
  "integrations/stacks",
  "integrations/hermetica",
  "integrations/bitcoin",
  "integrations/pox5",
  "frontend",
]) {
  console.log(`Installing locked dependencies: ${pkg}`);
  const install = spawnSync(npm, ["ci", "--ignore-scripts"], {
    cwd: root + pkg,
    stdio: "inherit",
  });
  if (install.status !== 0) process.exit(install.status ?? 1);
}
const build = spawnSync(npm, ["run", "build"], {
  cwd: root + "integrations/bitcoin",
  stdio: "inherit",
});
process.exit(build.status ?? 1);
