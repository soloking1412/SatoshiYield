export const MAX_UINT128 = (1n << 128n) - 1n;
/** Exact decimal parsing: no exponents, floating point or silent rounding. */
export function parseSbtcAmount(input: string): bigint {
  if (input.length > 48 || !/^(0|[1-9]\d*)(\.\d{1,8})?$/.test(input)) {
    throw new Error("Enter a decimal amount with at most 8 decimal places.");
  }
  const [whole, fraction = ""] = input.split(".");
  const amount = BigInt(whole!) * 100_000_000n + BigInt(fraction.padEnd(8, "0"));
  if (amount <= 0n || amount > MAX_UINT128) throw new Error("Amount is outside the supported range.");
  return amount;
}
export function formatSbtcAmount(sats: bigint): string {
  const sign = sats < 0n ? "-" : "";
  const n = sats < 0n ? -sats : sats;
  const fraction = (n % 100_000_000n).toString().padStart(8, "0").replace(/0+$/, "");
  return `${sign}${n / 100_000_000n}${fraction ? `.${fraction}` : ""}`;
}
