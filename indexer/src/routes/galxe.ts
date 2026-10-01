/** Current on-chain deposit credential. RPC or schema failure is never eligibility. */
import { Router } from "express";
import type { Request, Response } from "express";
import {
  standardPrincipalCV,
  contractPrincipalCV,
  serializeCV,
  deserializeCV,
  validateStacksAddress,
  type ClarityValue,
} from "@stacks/transactions";
import { chainNetwork } from "../network.js";

const NAME = /^[a-zA-Z][a-zA-Z0-9_-]{0,39}$/;
const prefix = chainNetwork.name === "mainnet" ? /^S[PM]/ : /^S[TN]/;
function addressValid(value: string) {
  return prefix.test(value) && validateStacksAddress(value);
}
function positionAmount(result: unknown): bigint {
  if (typeof result !== "string" || !/^0x(?:[0-9a-f]{2})+$/i.test(result))
    throw new Error("Malformed Clarity result");
  const cv = deserializeCV(result);
  if (serializeCV(cv).toLowerCase() !== result.slice(2).toLowerCase())
    throw new Error("Trailing result data");
  if (cv.type === "none") return 0n;
  if (cv.type !== "some" || cv.value.type !== "tuple")
    throw new Error("Expected an optional position tuple");
  const fields = cv.value.value;
  const uint = (key: string) => {
    const v = fields[key];
    if (v?.type !== "uint") throw new Error("Missing position uint");
    return BigInt(v.value);
  };
  if (!["true", "false"].includes(fields["is-async"]?.type ?? ""))
    throw new Error("Invalid withdrawal type");
  const status = uint("status");
  if (status !== 0n && status !== 1n)
    throw new Error("Unknown position status");
  uint("claim-id");
  uint("deposited-at");
  return uint("principal-amount");
}
export const galxeRouter = Router();
galxeRouter.get("/check", async (req: Request, res: Response) => {
  const raw = req.query["address"];
  const address = typeof raw === "string" ? raw.trim() : "";
  if (!addressValid(address)) {
    res
      .status(400)
      .json({
        error:
          "address must be a valid wallet on the configured Stacks network",
      });
    return;
  }
  try {
    const vault = process.env["VAULT_NAME"] ?? "vault-v6";
    const version = process.env["VAULT_VERSION"] ?? "v6";
    if (!NAME.test(vault) || !["v6", "v7"].includes(version))
      throw new Error("Invalid vault configuration");
    // v7 positions are keyed by adapter. Require an explicit bounded deployment list.
    const adapters =
      version === "v7"
        ? (process.env["VAULT_ADAPTERS"] ?? "")
            .split(",")
            .map((v) => v.trim())
            .filter(Boolean)
        : [];
    if (
      version === "v7" &&
      (adapters.length === 0 ||
        adapters.length > 20 ||
        new Set(adapters).size !== adapters.length)
    )
      throw new Error("v7 adapter list missing or invalid");
    const args: ClarityValue[][] =
      version === "v6"
        ? [[standardPrincipalCV(address)]]
        : adapters.map((id) => {
            const parts = id.split(".");
            if (
              parts.length !== 2 ||
              !addressValid(parts[0]!) ||
              !NAME.test(parts[1]!)
            )
              throw new Error("Invalid adapter principal");
            return [
              standardPrincipalCV(address),
              contractPrincipalCV(parts[0]!, parts[1]!),
            ];
          });
    const amounts = await Promise.all(
      args.map(async (values) => {
        const response = await fetch(
          `${chainNetwork.api}/v2/contracts/call-read/${chainNetwork.deployer}/${vault}/get-position`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              sender: chainNetwork.deployer,
              arguments: values.map((v) => "0x" + serializeCV(v)),
            }),
            signal: AbortSignal.timeout(8000),
          },
        );
        if (!response.ok) throw new Error("Chain query unavailable");
        const body: unknown = await response.json();
        if (
          !body ||
          typeof body !== "object" ||
          !("okay" in body) ||
          body.okay !== true ||
          !("result" in body)
        )
          throw new Error("Contract read failed");
        return positionAmount(body.result);
      }),
    );
    const amount = amounts.reduce((sum, value) => sum + value, 0n);
    // Preserve the existing numeric field where exact; retain large uint128 values as decimal text.
    res.json({
      is_eligible: amount > 0n,
      address,
      deposited_sats:
        amount <= BigInt(Number.MAX_SAFE_INTEGER)
          ? Number(amount)
          : amount.toString(),
      network: chainNetwork.name,
      vault: `${chainNetwork.deployer}.${vault}`,
    });
  } catch {
    res
      .status(503)
      .json({ error: "Verified chain position is temporarily unavailable" });
  }
});
