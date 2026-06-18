// Display formatting helpers.

/**
 * Decimal places to render an APY at, chosen so a genuinely small-but-nonzero
 * rate stays visible instead of collapsing to a misleading "0.0%".
 *   < 1%    -> 2 decimals (0.03 -> "0.03", 0.17 -> "0.17")
 *   < 100%  -> 1 decimal  (3.4  -> "3.4")
 *   >= 100% -> integer    (120  -> "120")
 * Exposed separately so an animated count-up can pick decimals from the target
 * value while still animating the intermediate frames cleanly.
 */
export function apyDecimals(apy: number): number {
  if (apy < 1) return 2;
  if (apy < 100) return 1;
  return 0;
}

/**
 * Honest APY string. A real rate that is tiny but non-zero (e.g. 0.03%) reads as
 * itself, never as "0.0". Use for static (non-animated) APY displays; append the
 * "%" at the call site. Returns just the number (no unit).
 *   0      -> "0"
 *   0.004  -> "<0.01"
 *   0.03   -> "0.03"
 *   3.4    -> "3.4"
 */
export function formatApy(apy: number): string {
  if (!Number.isFinite(apy) || apy <= 0) return "0";
  if (apy < 0.01) return "<0.01";
  return apy.toFixed(apyDecimals(apy));
}
