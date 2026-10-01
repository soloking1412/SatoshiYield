import { Router } from "express";
import type { Request, Response } from "express";
import {
  makeContractCall,
  broadcastTransaction,
  uintCV,
  standardPrincipalCV,
  validateStacksAddress,
  getAddressFromPrivateKey,
} from "@stacks/transactions";
import { chainNetwork } from "../network.js";

const router = Router();

const DEPLOYER = chainNetwork.deployer;
// Never share the oracle signing key with a public faucet.
const PRIVATE_KEY = process.env["FAUCET_PRIVATE_KEY"] ?? "";
const IS_MAINNET = chainNetwork.name === "mainnet";
const NETWORK    = IS_MAINNET ? ("mainnet" as const) : ("testnet" as const);
const API_BASE   = chainNetwork.api;

const FAUCET_AMOUNT_SATS = 10_000_000n; // 0.1 sBTC
const COOLDOWN_MS        = 60 * 60 * 1000; // 1 hour per address
const DAY_MS             = 24 * 60 * 60 * 1000;
// Global cap bounds abuse when an attacker cycles through fresh addresses.
const MAX_DAILY_MINTS    = Number(process.env["FAUCET_MAX_DAILY_MINTS"] ?? 200);
if (!Number.isSafeInteger(MAX_DAILY_MINTS) || MAX_DAILY_MINTS < 1 || MAX_DAILY_MINTS > 200) {
  throw new Error("FAUCET_MAX_DAILY_MINTS must be an integer between 1 and 200");
}

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
  const sender = getAddressFromPrivateKey(PRIVATE_KEY, NETWORK);
  const nonceRes = await fetch(`${API_BASE}/extended/v1/address/${sender}/nonces`, {
    signal: AbortSignal.timeout(6_000),
  });
  if (!nonceRes.ok) throw new Error("Faucet nonce unavailable");
  const nonceData = (await nonceRes.json()) as { possible_next_nonce: number };
  if (!Number.isSafeInteger(nonceData.possible_next_nonce) || nonceData.possible_next_nonce < 0) {
    throw new Error("Invalid faucet nonce");
  }

  const tx = await makeContractCall({
    contractAddress: DEPLOYER,
    contractName:    "mock-sbtc",
    functionName:    "mint",
    functionArgs:    [uintCV(FAUCET_AMOUNT_SATS), standardPrincipalCV(address)],
    senderKey:       PRIVATE_KEY,
    network:         NETWORK,
    client:          { baseUrl: API_BASE },
    nonce:           BigInt(nonceData.possible_next_nonce),
  });

  const result = await broadcastTransaction({ transaction: tx, network: NETWORK, client: { baseUrl: API_BASE } });
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

  const address: unknown = req.body?.address;
  if (typeof address !== "string" || !/^S[TN]/.test(address) || !validateStacksAddress(address)) {
    res.status(400).json({ error: "Invalid Stacks address" });
    return;
  }

  try {
    const txid = await serialize(async () => {
      // Check and reserve limits inside the same critical section as signing.
      // Otherwise concurrent requests all pass before the first broadcast ends.
      const now = Date.now();
      const last = lastFaucet.get(address) ?? 0;
      mintTimes = mintTimes.filter((t) => now - t < DAY_MS);
      for (const [wallet, time] of lastFaucet) {
        if (now - time >= COOLDOWN_MS) lastFaucet.delete(wallet);
      }
      if (now - last < COOLDOWN_MS || mintTimes.length >= MAX_DAILY_MINTS) return null;
      lastFaucet.set(address, now);
      mintTimes.push(now);
      // Retain the reservation if broadcast outcome is uncertain.
      return mint(address);
    });
    if (txid === null) {
      res.status(429).json({ error: "Faucet cooldown or daily limit reached" });
      return;
    }
    console.log(`[faucet] minted 0.1 sBTC -> ${address} txid=${txid}`);
    res.json({ txid, amount: Number(FAUCET_AMOUNT_SATS) });
  } catch (err) {
    console.error("[faucet] error:", (err as Error).message);
    res.status(500).json({ error: "Faucet temporarily unavailable" });
  }
});

export const faucetRouter = router;
