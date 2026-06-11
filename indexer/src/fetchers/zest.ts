import type { NormalizedYield } from "../types.js";
import { buildYield } from "./build.js";
import { fetchZestNativeApy } from "./native-apy.js";

export function fetchZest(): Promise<NormalizedYield> {
  return buildYield("zest", fetchZestNativeApy);
}
