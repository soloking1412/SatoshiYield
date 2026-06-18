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
import { standardPrincipalCV, serializeCV } from "@stacks/transactions";

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
    const principalHex =
      "0x" + Buffer.from(serializeCV(standardPrincipalCV(address))).toString("hex");

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

    // Clarity optional: 0x09 = none (no position), 0x0a... = (some ...) (active position)
    const resultHex = payload.result.startsWith("0x")
      ? payload.result.slice(2)
      : payload.result;
    const is_eligible = resultHex.startsWith("0a");

    // Decode principal-amount (deposited sats) from the tuple for display.
    // Tuple field order (Clarity alphabetical): adapter, claim-id, deposited-at,
    // is-async, principal-amount, status. Extract only what Galxe displays.
    const deposited_sats = is_eligible ? decodePrincipalAmount(resultHex) : 0;

    console.log(`[galxe] check ${address} -> eligible=${is_eligible} sats=${deposited_sats}`);

    res.json({ is_eligible, address, deposited_sats });
  } catch (err) {
    console.error("[galxe] error:", (err as Error).message);
    res.status(503).json({ error: "Chain query temporarily unavailable" });
  }
});

/**
 * Extracts the `principal-amount` uint from a serialized Clarity
 * `(some { adapter, claim-id, deposited-at, is-async, principal-amount, status })`
 * response. Returns 0 on any parse error — the eligibility check is the
 * authoritative signal; this is decoration only.
 *
 * Binary layout (all offsets in hex nibbles, i.e. 2 per byte):
 *   0a            – (some ...)           [1 byte  = 2 nibbles]
 *   0c            – tuple type           [1 byte  = 2 nibbles]
 *   00000006      – field count (6)      [4 bytes = 8 nibbles]
 *   07 "adapter"  – field 1 name+value   [1+7 bytes name, then principal value]
 *   ... (adapter principal: 1 type + 1 version + 20 hash bytes = 22 bytes)
 *   08 "claim-id" – field 2 name+value   [1+8 bytes name, then uint 16 bytes]
 *   0c "deposited-at" – field 3          [1+12 bytes name, then uint 16 bytes]
 *   08 "is-async" – field 4             [1+8 bytes name, then bool 1 byte]
 *   10 "principal-amount" – field 5     [1+16 bytes name, then uint 16 bytes]  ← target
 */
function decodePrincipalAmount(hex: string): number {
  try {
    // Convert hex string to byte offsets (each byte = 2 chars)
    let pos = 0; // in bytes

    const byte = (offset: number) =>
      parseInt(hex.slice(offset * 2, offset * 2 + 2), 16);

    const uint16Bytes = (offset: number): bigint => {
      let val = 0n;
      for (let i = 0; i < 16; i++) {
        val = (val << 8n) | BigInt(byte(offset + i));
      }
      return val;
    };

    // 0a (some), 0c (tuple), 00000006 (field count)
    pos = 1 + 1 + 4; // 6 bytes past start

    // Field 1: "adapter" (7-char name) + principal value
    // name: 1 byte length + 7 bytes
    pos += 1 + 7;
    // principal value: type byte (05) + version (1) + hash (20) = 22 bytes
    if (byte(pos) !== 0x05) return 0;
    pos += 22;

    // Field 2: "claim-id" (8-char name) + uint (16 bytes)
    pos += 1 + 8;
    if (byte(pos) !== 0x01) return 0;
    pos += 1 + 16;

    // Field 3: "deposited-at" (12-char name) + uint (16 bytes)
    pos += 1 + 12;
    if (byte(pos) !== 0x01) return 0;
    pos += 1 + 16;

    // Field 4: "is-async" (8-char name) + bool — in Clarity, false=0x03 and
    // true=0x04 each occupy exactly 1 byte (the type byte IS the value).
    pos += 1 + 8;
    if (byte(pos) !== 0x03 && byte(pos) !== 0x04) return 0;
    pos += 1;

    // Field 5: "principal-amount" (16-char name) + uint (16 bytes) ← we want this
    pos += 1 + 16;
    if (byte(pos) !== 0x01) return 0;
    pos += 1; // skip type byte

    const amount = uint16Bytes(pos);
    return amount > BigInt(Number.MAX_SAFE_INTEGER) ? 0 : Number(amount);
  } catch {
    return 0;
  }
}
