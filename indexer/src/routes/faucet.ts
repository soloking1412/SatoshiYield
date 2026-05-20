import { Router } from "express";
import type { Request, Response } from "express";
import {
  makeContractCall,
  broadcastTransaction,
  uintCV,
  standardPrincipalCV,
} from "@stacks/transactions";

const router = Router();

const DEPLOYER = process.env["DEPLOYER_ADDRESS"] ?? "";
// Prefer a dedicated faucet key. Falling back to the oracle key means faucet
// spam drains the oracle's STX gas — set FAUCET_PRIVATE_KEY in production.
const PRIVATE_KEY =
  process.env["FAUCET_PRIVATE_KEY"] ?? process.env["ORACLE_PRIVATE_KEY"] ?? "";
const IS_MAINNET = process.env["STACKS_NETWORK"] === "mainnet";
const NETWORK    = IS_MAINNET ? ("mainnet" as const) : ("testnet" as const);
const API_BASE   = IS_MAINNET ? "https://api.hiro.so" : "https://api.testnet.hiro.so";

const FAUCET_AMOUNT_SATS = 10_000_000n; // 0.1 sBTC
const COOLDOWN_MS        = 60 * 60 * 1000; // 1 hour per address
const DAY_MS             = 24 * 60 * 60 * 1000;
// Global cap bounds abuse when an attacker cycles through fresh addresses.
const MAX_DAILY_MINTS    = Number(process.env["FAUCET_MAX_DAILY_MINTS"] ?? 200);
const VALID_STX          = /^S[TP][A-Z0-9]{38,39}$/;

const lastFaucet = new Map<string, number>(); // address -> last mint timestamp
let mintTimes: number[] = [];                  // rolling 24h global mint timestamps

// Serialize sends so concurrent requests never fetch and reuse the same nonce.
let sendChain: Promise<unknown> = Promise.resolve();
function serialize<T>(fn: () => Promise<T>): Promise<T> {
  const run = sendChain.then(fn, fn);
  sendChain = run.catch(() => undefined);
  return run;
}

async function mint(address: string): Promise<string> {
  const nonceRes = await fetch(`${API_BASE}/v2/accounts/${DEPLOYER}?proof=0`, {
    signal: AbortSignal.timeout(6_000),
  });
  const nonceData = (await nonceRes.json()) as { nonce: number };

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
  if ("error" in result) throw new Error(String(result.error));
  return result.txid;
}

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

  const now = Date.now();

  // Per-address cooldown.
  const last = lastFaucet.get(address) ?? 0;
  if (now - last < COOLDOWN_MS) {
    res.status(429).json({
      error: "Faucet cooldown active",
      nextAvailableMs: COOLDOWN_MS - (now - last),
    });
    return;
  }

  // Global daily cap — cooldowns alone don't stop fresh-address cycling.
  mintTimes = mintTimes.filter((t) => now - t < DAY_MS);
  if (mintTimes.length >= MAX_DAILY_MINTS) {
    res.status(429).json({ error: "Faucet daily limit reached — try again tomorrow" });
    return;
  }

  try {
    const txid = await serialize(() => mint(address));
    lastFaucet.set(address, now);
    mintTimes.push(now);
    console.log(`[faucet] minted 0.1 sBTC -> ${address} txid=${txid}`);
    res.json({ txid, amount: Number(FAUCET_AMOUNT_SATS) });
  } catch (err) {
    console.error("[faucet] error:", (err as Error).message);
    res.status(500).json({ error: "Faucet temporarily unavailable" });
  }
});

export const faucetRouter = router;
