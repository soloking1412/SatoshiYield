import type { NormalizedYield } from "../types.js";
import { buildYield } from "./build.js";
import { ADAPTER_REGISTRY } from "../registry.js";

export function fetchZest(): Promise<NormalizedYield> {
  return buildYield("zest", ADAPTER_REGISTRY.zest);
}
