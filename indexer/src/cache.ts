import NodeCache from "node-cache";
import { config } from "./config.js";

export const cache = new NodeCache({
  stdTTL: config.cacheSeconds,
  checkperiod: Math.ceil(config.cacheSeconds / 5),
  useClones: false,
});
