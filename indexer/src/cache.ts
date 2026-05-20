import NodeCache from "node-cache";
import { config } from "./config.js";

export const cache = new NodeCache({
  stdTTL: config.cacheSeconds,
  checkperiod: Math.ceil(config.cacheSeconds / 5),
  // Clone on get/set so a handler mutating a returned object can't corrupt
  // the cached value for later requests. Cached payloads are tiny.
  useClones: true,
});
