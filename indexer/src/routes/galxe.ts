/**
 * GET /api/galxe/check?address=SP...
 *
 * Galxe "Third-party API" credential endpoint. Returns whether a Stacks address
 * currently holds an active position in vault-v6. Galxe polls this for each
 * user who claims the "Genesis Depositor" credential.
 *
 * Galxe expects: { "is_eligible": true | false }
 * We also echo the address and deposited_sats for transparency.
 */
import { Router } from "express";
import type { Request, Response } from "express";
import {
  standardPrincipalCV,
  serializeCV,
  deserializeCV,
  type ClarityValue,
} from "@stacks/transactions";

const TIMEOUT_MS = 8_000;

// Matches SP... (mainnet) and ST... (testnet) standard principals only.
// Contract principals (containing ".") are not valid depositor addresses.
const VALID_STX_ADDR = /^S[TP][A-Z0-9]{38,39}$/;

export const galxeRouter = Router();

galxeRouter.get("/check", async (req: Request, res: Response) => {
  const raw = req.query["address"];
  const address = typeof raw === "string" ? raw.trim() : "";

  if (!VALID_STX_ADDR.test(address)) {
    res.status(400).json({ error: "address must be a valid Stacks principal (SP.../ST...)" });
    return;
  }

  // Read lazily so tests can inject env vars after module load.
  const deployer = process.env["DEPLOYER_ADDRESS"] ?? "";
  const stacksApi = process.env["STACKS_API_URL"] ?? "https://api.hiro.so";
  const vaultName = process.env["VAULT_NAME"] ?? "vault-v6";

  if (!deployer) {
    console.error("[galxe] DEPLOYER_ADDRESS not set");
    res.status(503).json({ error: "Indexer not configured" });
    return;
  }

  try {
    // serializeCV (v7) already returns a hex string — do NOT wrap it in
    // Buffer.from().toString("hex"), which double-encodes it (treats the hex
    // chars as raw bytes) and makes the chain reject the argument.
    const principalHex = "0x" + serializeCV(standardPrincipalCV(address));

    const url =
      `${stacksApi}/v2/contracts/call-read/${deployer}/${vaultName}/get-position`;

    const chainRes = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sender: deployer, arguments: [principalHex] }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (!chainRes.ok) {
      console.error(`[galxe] chain call returned HTTP ${chainRes.status} for ${address}`);
      res.status(503).json({ error: "Chain query temporarily unavailable" });
      return;
    }

    const payload = (await chainRes.json()) as { okay: boolean; result: string };

    if (!payload.okay) {
      console.error(`[galxe] contract returned okay=false for ${address}`);
      res.status(503).json({ error: "Contract read failed" });
      return;
    }

    // get-position returns (optional { ... }): `none` = no position,
    // `(some tuple)` = active position. Deserialize with the library rather
    // than hand-parsing bytes — the adapter field is a contract principal of
    // variable length, which fixed byte offsets can't handle reliably.
    const cv = deserializeCV(payload.result);
    const is_eligible = cv.type === "some";
    const deposited_sats = is_eligible ? readPrincipalAmount(cv) : 0;

    console.log(`[galxe] check ${address} -> eligible=${is_eligible} sats=${deposited_sats}`);

    res.json({ is_eligible, address, deposited_sats });
  } catch (err) {
    console.error("[galxe] error:", (err as Error).message);
    res.status(503).json({ error: "Chain query temporarily unavailable" });
  }
});

/**
 * Reads the `principal-amount` uint (deposited sats) from a deserialized
 * `(some { ... principal-amount: uint ... })` position tuple. Returns 0 on any
 * shape mismatch — eligibility is the authoritative signal; this is decoration.
 */
function readPrincipalAmount(some: ClarityValue): number {
  try {
    if (some.type !== "some") return 0;
    const tuple = some.value;
    if (tuple.type !== "tuple") return 0;
    const field = tuple.value["principal-amount"];
    if (!field || field.type !== "uint") return 0;
    const amount = BigInt(field.value);
    return amount > BigInt(Number.MAX_SAFE_INTEGER) ? 0 : Number(amount);
  } catch {
    return 0;
  }
}
