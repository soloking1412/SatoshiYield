import { Router } from "express";
import type { Request, Response } from "express";
import {
  makeContractCall,
  broadcastTransaction,
  uintCV,
  standardPrincipalCV,
} from "@stacks/transactions";

const router = Router();

const DEPLOYER    = process.env["DEPLOYER_ADDRESS"]   ?? "";
const PRIVATE_KEY = process.env["ORACLE_PRIVATE_KEY"] ?? "";
const IS_MAINNET  = process.env["STACKS_NETWORK"]     === "mainnet";
const NETWORK     = IS_MAINNET ? "mainnet" as const : "testnet" as const;
const API_BASE    = IS_MAINNET ? "https://api.hiro.so" : "https://api.testnet.hiro.so";

const FAUCET_AMOUNT_SATS = 10_000_000n; // 0.1 sBTC
const COOLDOWN_MS        = 60 * 60 * 1000; // 1 hour per address
const VALID_STX          = /^S[TP][A-Z0-9]{38,39}$/;

// In-memory rate-limit store (resets on server restart — fine for testnet)
const lastFaucet = new Map<string, number>();

router.post("/", async (req: Request, res: Response) => {
  if (IS_MAINNET) {
    res.status(403).json({ error: "Faucet not available on mainnet" });
    return;
  }
  if (!DEPLOYER || !PRIVATE_KEY) {
    res.status(503).json({ error: "Faucet not configured on this server" });
    return;
  }

  const { address } = req.body as { address?: unknown };
  if (typeof address !== "string" || !VALID_STX.test(address)) {
    res.status(400).json({ error: "Invalid Stacks address" });
    return;
  }

  const now  = Date.now();
  const last = lastFaucet.get(address) ?? 0;
  if (now - last < COOLDOWN_MS) {
    const nextAvailableMs = COOLDOWN_MS - (now - last);
    res.status(429).json({ error: "Faucet cooldown active", nextAvailableMs });
    return;
  }

  try {
    const nonceRes  = await fetch(`${API_BASE}/v2/accounts/${DEPLOYER}?proof=0`,
      { signal: AbortSignal.timeout(6_000) });
    const nonceData = await nonceRes.json() as { nonce: number };

    const tx = await makeContractCall({
      contractAddress: DEPLOYER,
      contractName:    "mock-sbtc",
      functionName:    "mint",
      functionArgs:    [uintCV(FAUCET_AMOUNT_SATS), standardPrincipalCV(address)],
      senderKey:       PRIVATE_KEY,
      network:         NETWORK,
      nonce:           BigInt(nonceData.nonce),
    });

    const result = await broadcastTransaction({ transaction: tx, network: NETWORK });

    if ("error" in result) {
      console.error("[faucet] broadcast failed:", result.error);
      res.status(500).json({ error: String(result.error) });
      return;
    }

    lastFaucet.set(address, now);
    console.log(`[faucet] minted 0.1 sBTC → ${address} txid=${result.txid}`);
    res.json({ txid: result.txid, amount: Number(FAUCET_AMOUNT_SATS) });
  } catch (err) {
    console.error("[faucet] error:", (err as Error).message);
    res.status(500).json({ error: "Faucet temporarily unavailable" });
  }
});

export const faucetRouter = router;
