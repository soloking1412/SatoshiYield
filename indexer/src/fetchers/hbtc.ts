import type { NormalizedYield } from "../types.js";
import { buildYield } from "./build.js";
import { fetchHbtcNativeApy } from "./native-apy.js";

export function fetchHbtc(): Promise<NormalizedYield> {
  return buildYield("hbtc", fetchHbtcNativeApy);
}
