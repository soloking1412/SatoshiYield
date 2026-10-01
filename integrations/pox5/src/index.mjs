import * as sdk from "@stacks/bitcoin-staking";
import {
  serializeCV,
  hexToCV,
  validateStacksAddress,
} from "@stacks/transactions";
import { Transaction } from "@scure/btc-signer";
import pins from "./source-pins.json" with { type: "json" };
export const SDK_VERSION = "7.6.0";
export const NETWORKS = Object.freeze({
  mainnet: {
    api: "https://api.hiro.so",
    chainId: 1,
    bitcoin: "mainnet",
    bitcoinSdk: "mainnet",
  },
  testnet: {
    api: "https://api.testnet.hiro.so",
    chainId: 0x80000000,
    bitcoin: "regtest",
    bitcoinSdk: "devnet",
  },
});
const MAX = (1n << 128n) - 1n;
const assert = (ok, message) => {
  if (!ok) throw new Error(message);
};
export function exactUint(value, { zero = false, label = "amount" } = {}) {
  assert(
    typeof value === "bigint" ||
      (typeof value === "string" && /^(0|[1-9][0-9]*)$/.test(value)),
    `${label} must be an exact integer`,
  );
  const n = BigInt(value);
  assert(n >= (zero ? 0n : 1n) && n <= MAX, `${label} outside uint128`);
  return n;
}
const hex = (bytes) =>
  Array.from(bytes, (v) => v.toString(16).padStart(2, "0")).join("");
const bytes = (value) => {
  assert(
    typeof value === "string" && /^(?:[0-9a-f]{2})+$/i.test(value),
    "Invalid hexadecimal bytes",
  );
  return Uint8Array.from(value.match(/../g), (v) => parseInt(v, 16));
};
const immutable = (value) => {
  if (value && typeof value === "object") {
    Object.values(value).forEach(immutable);
    Object.freeze(value);
  }
  return value;
};
function addressOn(value, network, contract = false) {
  const parts = typeof value === "string" ? value.split(".") : [];
  assert(
    parts.length === (contract ? 2 : 1) &&
      validateStacksAddress(parts[0]) &&
      (network === "mainnet" ? /^S[PM]/ : /^S[TN]/).test(parts[0]),
    "Wallet or signer address is on the wrong network",
  );
  if (contract)
    assert(
      /^[a-zA-Z][a-zA-Z0-9_-]{0,39}$/.test(parts[1]),
      "Invalid signer manager contract",
    );
  return value;
}
const safeInt = (n, label) => {
  assert(Number.isSafeInteger(n) && n >= 0, `Invalid ${label}`);
  return n;
};
export function strictClarity(value) {
  assert(
    typeof value === "string" && /^0x(?:[0-9a-f]{2})+$/i.test(value),
    "Malformed Clarity response",
  );
  const cv = hexToCV(value);
  assert(
    serializeCV(cv).toLowerCase() === value.slice(2).toLowerCase(),
    "Trailing Clarity response data",
  );
  return cv;
}

/** Read-only eligibility and non-signing recovery preparation. This client never broadcasts. */
export function createPox5Client({
  network = "testnet",
  fetch: fetcher = globalThis.fetch,
  now = Date.now,
} = {}) {
  assert(
    Object.hasOwn(NETWORKS, network),
    "Explicit supported network required",
  );
  const config = NETWORKS[network],
    pin = pins[network];
  const observations = new WeakSet();
  const contexts = new WeakMap();
  let verifiedAt = 0;
  async function get(url, init) {
    const r = await fetcher(url, {
      ...init,
      signal: AbortSignal.timeout(15000),
    });
    assert(r.ok, `PoX-5 RPC unavailable (${r.status})`);
    return r;
  }
  async function snapshot() {
    const start = now();
    const info = await (await get(config.api + "/v2/info")).json();
    assert(info.network_id === config.chainId, "PoX-5 network mismatch");
    safeInt(info.stacks_tip_height, "Stacks tip");
    safeInt(info.burn_block_height, "Bitcoin tip");
    const block = await (
      await get(config.api + "/extended/v2/blocks/" + info.stacks_tip_height)
    ).json();
    assert(
      block.canonical === true &&
        block.height === info.stacks_tip_height &&
        block.hash?.replace(/^0x/, "") === info.stacks_tip &&
        /^0x[0-9a-f]{64}$/i.test(block.index_block_hash),
      "Canonical tip mismatch",
    );
    if (now() - verifiedAt > 300000 || verifiedAt === 0) {
      const source = await (await get(pin.sourceUrl)).json();
      assert(typeof source.source === "string", "PoX-5 source unavailable");
      const digest = hex(
        new Uint8Array(
          await crypto.subtle.digest(
            "SHA-256",
            new TextEncoder().encode(source.source),
          ),
        ),
      );
      assert(digest === pin.sha256, "PoX-5 source changed; review required");
      verifiedAt = now();
    }
    // The SDK uses the supplied transport for every read. Pin state calls to one canonical tip.
    const client = {
      baseUrl: config.api,
      fetch: async (input, init) => {
        const url = new URL(typeof input === "string" ? input : input.url);
        assert(
          url.origin === config.api,
          "SDK attempted an unexpected RPC origin",
        );
        if (
          [
            "/v2/contracts/call-read/",
            "/v2/map_entry/",
            "/v2/data_var/",
            "/v2/accounts/",
          ].some((p) => url.pathname.startsWith(p))
        )
          url.searchParams.set("tip", block.index_block_hash);
        const r = await get(url.toString(), init);
        const body = await r.clone().json();
        if (url.pathname.startsWith("/v2/contracts/call-read/")) {
          assert(body.okay === true, "PoX-5 contract read failed");
          const cv = strictClarity(body.result);
          if (
            url.pathname.endsWith("/verify-signer-key-grant") &&
            cv.type === "ok"
          )
            assert(
              cv.value.type === "true",
              "Signer grant was not positively verified",
            );
        }
        if (
          url.pathname.startsWith("/v2/map_entry/") ||
          url.pathname.startsWith("/v2/data_var/")
        )
          strictClarity(body.data);
        return r;
      },
    };
    const options = { network, client };
    const pox = await sdk.fetchPoxInfo(options);
    assert(pox.contractId === pin.contract, "PoX-5 is not the active contract");
    for (const name of [
      "currentBurnchainBlockHeight",
      "firstBurnchainBlockHeight",
      "rewardCycleId",
      "rewardCycleLength",
      "prepareCycleLength",
    ])
      safeInt(pox[name], name);
    assert(
      pox.currentBurnchainBlockHeight === info.burn_block_height,
      "Bitcoin tip changed during observation; refresh",
    );
    assert(
      pox.rewardCycleLength > 0 &&
        pox.prepareCycleLength < pox.rewardCycleLength,
      "Invalid reward cycle schedule",
    );
    assert(
      pox.contractVersions.some(
        (v) =>
          v.contractId === pin.contract &&
          v.activationBurnchainBlockHeight <= info.burn_block_height,
      ),
      "PoX-5 has not activated",
    );
    addressOn(pox.sbtcContract, network, true);
    addressOn(pox.sbtcRegistryContract, network, true);
    return { start, info, tip: block.index_block_hash, pox, options };
  }
  async function observe({
    address,
    bondIndex,
    amountSats,
    signerManager,
  } = {}) {
    addressOn(address, network);
    if (bondIndex !== undefined) {
      safeInt(bondIndex, "bond index");
      assert(bondIndex < 100000, "Bond index exceeds supported range");
    }
    const amount = exactUint(amountSats);
    if (signerManager !== undefined) addressOn(signerManager, network, true);
    const s = await snapshot();
    if (bondIndex === undefined) {
      const first = sdk.firstPox5RewardCycle(s.pox);
      assert(Number.isSafeInteger(first), "PoX-5 activation cycle unavailable");
      bondIndex = Math.max(
        0,
        Math.floor((s.pox.rewardCycleId - first) / 2) + 1,
      );
    }
    const opts = { ...s.options, address };
    const [bond, allowance, account, staker, membership] = await Promise.all([
      sdk.fetchProtocolBond({ ...s.options, bondIndex }),
      sdk.fetchBondAllowance({ ...opts, bondIndex }),
      sdk.fetchAccountStatus(opts),
      sdk.fetchStakerInfo(opts),
      sdk.fetchBondMembership(opts),
    ]);
    exactUint(account.balance, { zero: true });
    exactUint(account.locked, { zero: true });
    if (allowance !== undefined) exactUint(allowance, { zero: true });
    let requiredUstx = null,
      signer = null,
      signerGrantActive = false;
    const status = sdk.bondStatus({
      bondIndex,
      poxInfo: s.pox,
      isBondSetup: !!bond,
    });
    const reasons = [];
    if (!bond) reasons.push("This bond has not been announced on-chain.");
    if (allowance === undefined || allowance < amount)
      reasons.push(
        "This wallet has no sufficient bond allowance. The bond administrator must approve it before any BTC is locked.",
      );
    if (status !== "open")
      reasons.push(
        `Registration is ${status}. Do not fund a lock address outside an open registration window.`,
      );
    if (
      sdk.isInPreparePhase({
        burnHeight: s.info.burn_block_height,
        poxInfo: s.pox,
      })
    )
      reasons.push("Registration is closed during the prepare phase.");
    if (bond) {
      exactUint(bond.stxValueRatio);
      safeInt(bond.minUstxRatioBps, "bond STX ratio");
      assert(bond.minUstxRatioBps <= 10000, "Invalid bond STX ratio");
      sdk.validateEarlyUnlockBytes(bond.earlyUnlockBytes, { shape: true });
      requiredUstx = sdk.minUstxForSatsAmount({
        sats: amount,
        stxValueRatio: bond.stxValueRatio,
        minUstxRatioBps: bond.minUstxRatioBps,
      });
      if (account.balance < requiredUstx)
        reasons.push("Available STX does not cover the paired commitment.");
    }
    if (staker.staked || membership)
      reasons.push(
        "An existing stake or bond requires the separate rollover flow.",
      );
    if (!signerManager)
      reasons.push(
        "Select a registered signer manager before preparing a commitment.",
      );
    else {
      signer = await sdk.fetchSignerInfo({ ...s.options, signerManager });
      if (signer)
        signerGrantActive = await sdk.fetchVerifySignerKeyGrant({
          ...s.options,
          signerManager,
          signerKey: signer.signerKey,
        });
      if (!signer || !signerGrantActive)
        reasons.push(
          "The signer manager has no active registered signing key.",
        );
    }
    assert(now() - s.start <= 60000, "PoX-5 observation expired; refresh");
    const state = immutable({
      network,
      bitcoinNetwork: config.bitcoin,
      address,
      bondIndex,
      amountSats: amount,
      signerManager: signerManager ?? null,
      signerKey: signer?.signerKey ?? null,
      signerGrantActive,
      pox: s.pox,
      bond: bond ?? null,
      allowance: allowance ?? 0n,
      requiredUstx,
      account,
      staker,
      membership: membership ?? null,
      status,
      reasons,
      preflightPassed: reasons.length === 0,
      fundingAllowed: false,
      tip: s.tip,
      sourceHash: pin.sha256,
      observedAt: s.start,
      expiresAt: s.start + 60000,
      limitations: [
        "Signer-manager public validation and Bitcoin inclusion proofs must still pass at registration.",
        "Bitcoin remains timelocked even if Stacks registration fails or misses its deadline.",
        "Funding and registration signing are not enabled by this observation.",
      ],
    });
    observations.add(state);
    contexts.set(state, s.options);
    return state;
  }
  async function prepareLock(
    state,
    { bitcoinPublicKey, maxUnlockHeight } = {},
  ) {
    assert(observations.has(state), "Use an observation from this client");
    assert(
      now() >= state.observedAt && now() < state.expiresAt,
      "Observation expired",
    );
    assert(
      state.preflightPassed,
      "Bond prerequisites are not satisfied; do not lock BTC",
    );
    assert(
      typeof bitcoinPublicKey === "string" &&
        /^(02|03)[0-9a-f]{64}$/i.test(bitcoinPublicKey),
      "Compressed Bitcoin wallet public key required",
    );
    safeInt(maxUnlockHeight, "maximum lock height");
    const metadata = sdk.buildRegisterMetadata({
      bondIndex: state.bondIndex,
      poxInfo: state.pox,
      bitcoinPublicKey,
      stxAddress: state.address,
      earlyUnlockBytes: state.bond.earlyUnlockBytes,
      network: config.bitcoinSdk,
    });
    assert(
      metadata.unlockHeight <= maxUnlockHeight,
      "Bond lock exceeds the reviewed maximum",
    );
    // Re-read current eligibility and compare every value that commits funds.
    const fresh = await observe({
      address: state.address,
      bondIndex: state.bondIndex,
      amountSats: state.amountSats,
      signerManager: state.signerManager,
    });
    assert(
      fresh.preflightPassed &&
        fresh.requiredUstx === state.requiredUstx &&
        fresh.signerKey === state.signerKey &&
        [
          "earlyUnlockBytes",
          "targetRateBps",
          "minUstxRatioBps",
          "stxValueRatio",
        ].every((key) => fresh.bond[key] === state.bond[key]),
      "Bond parameters or eligibility changed",
    );
    const rebuilt = sdk.buildRegisterMetadata({
      bondIndex: fresh.bondIndex,
      poxInfo: fresh.pox,
      bitcoinPublicKey,
      stxAddress: fresh.address,
      earlyUnlockBytes: fresh.bond.earlyUnlockBytes,
      network: config.bitcoinSdk,
    });
    assert(
      rebuilt.unlockHeight === metadata.unlockHeight,
      "Bond schedule changed",
    );
    const canonicalUnlock = await sdk.fetchBondL1UnlockHeight({
      bondIndex: fresh.bondIndex,
      ...contexts.get(fresh),
    });
    assert(
      exactUint(canonicalUnlock, { zero: true }) ===
        BigInt(metadata.unlockHeight),
      "SDK and canonical contract disagree on the bond unlock height",
    );
    const onchain = await sdk.fetchConstructLockupOutputScript({
      stxAddress: state.address,
      unlockHeight: metadata.unlockHeight,
      unlockBytes: metadata.unlockBytes,
      earlyUnlockBytes: state.bond.earlyUnlockBytes,
      ...contexts.get(fresh),
    });
    assert(
      hex(onchain) === hex(metadata.outputScript),
      "SDK and canonical contract disagree on the lock script",
    );
    assert(
      now() >= fresh.observedAt && now() < fresh.expiresAt,
      "Lock plan expired during final verification",
    );
    return immutable({
      kind: "pox5-lock-plan",
      network,
      bitcoinNetwork: config.bitcoin,
      stxAddress: state.address,
      bitcoinPublicKey,
      bondIndex: state.bondIndex,
      amountSats: state.amountSats,
      requiredUstx: state.requiredUstx,
      earlyUnlockBytes: state.bond.earlyUnlockBytes,
      lockAddress: metadata.lockAddress,
      lockScript: hex(metadata.lockScript),
      outputScript: hex(metadata.outputScript),
      unlockBytes: hex(metadata.unlockBytes),
      unlockHeight: metadata.unlockHeight,
      expiresAt: fresh.expiresAt,
      fundingAllowed: false,
      broadcastAllowed: false,
      reason:
        "Preparation only. Complete wallet ownership verification, deadline review, signer-manager acceptance and registration proof support before funding.",
    });
  }
  function prepareReclaim(
    plan,
    { utxo, destination, feeSats, maxFeeSats, currentBitcoinHeight } = {},
  ) {
    // Recovery must survive browser restarts. Reconstruct and validate a saved
    // public plan instead of trusting serialized flags or requiring a live quote.
    assert(
      plan?.kind === "pox5-lock-plan" &&
        plan.network === network &&
        plan.bitcoinNetwork === config.bitcoin,
      "Recovery plan network mismatch",
    );
    addressOn(plan.stxAddress, network);
    safeInt(plan.unlockHeight, "unlock height");
    assert(plan.unlockHeight < 500000000, "Invalid height-based timelock");
    const unlock = sdk.buildUnlockScript(plan.bitcoinPublicKey),
      lock = sdk.buildLockScript({
        stxAddress: plan.stxAddress,
        unlockHeight: plan.unlockHeight,
        unlockBytes: unlock,
        earlyUnlockBytes: plan.earlyUnlockBytes,
      });
    const output = sdk.buildLockOutputScript({
      stxAddress: plan.stxAddress,
      unlockHeight: plan.unlockHeight,
      unlockBytes: unlock,
      earlyUnlockBytes: plan.earlyUnlockBytes,
    });
    const address = sdk.buildLockAddress({
      stxAddress: plan.stxAddress,
      unlockHeight: plan.unlockHeight,
      unlockBytes: unlock,
      earlyUnlockBytes: plan.earlyUnlockBytes,
      network: config.bitcoinSdk,
    });
    assert(
      hex(lock) === plan.lockScript &&
        hex(output) === plan.outputScript &&
        hex(unlock) === plan.unlockBytes &&
        address === plan.lockAddress,
      "Recovery plan script was altered",
    );
    safeInt(currentBitcoinHeight, "Bitcoin height");
    assert(
      currentBitcoinHeight >= plan.unlockHeight,
      "Bitcoin timelock has not matured",
    );
    const fee = exactUint(feeSats),
      maximum = exactUint(maxFeeSats);
    assert(fee <= maximum, "Recovery fee exceeds reviewed maximum");
    assert(
      utxo &&
        typeof utxo.txid === "string" &&
        /^[0-9a-f]{64}$/i.test(utxo.txid),
      "Invalid recovery outpoint",
    );
    safeInt(utxo.vout, "output index");
    const value = exactUint(utxo.value);
    assert(
      value === exactUint(plan.amountSats),
      "Recovery amount differs from lock plan",
    );
    assert(
      utxo.scriptPubKey === plan.outputScript,
      "Recovery output does not match the verified lock script",
    );
    assert(
      typeof utxo.rawTransactionHex === "string" &&
        utxo.rawTransactionHex.length <= 8000000,
      "Original locking transaction is required",
    );
    const original = Transaction.fromRaw(bytes(utxo.rawTransactionHex), {
      allowUnknownOutputs: true,
      allowUnknownInputs: true,
    });
    assert(
      original.id === utxo.txid.toLowerCase(),
      "Recovery transaction ID mismatch",
    );
    const originalOutput = original.getOutput(utxo.vout);
    assert(
      originalOutput.amount === value &&
        hex(originalOutput.script) === plan.outputScript,
      "Recovery outpoint does not match the original transaction",
    );
    const tx = sdk.buildReclaim({
      path: "locktime",
      utxo: { txid: utxo.txid, vout: utxo.vout, value },
      network: config.bitcoinSdk,
      output: { address: destination, feeSats: fee },
      lockScript: plan.lockScript,
    });
    return {
      kind: "pox5-recovery-plan",
      network,
      bitcoinNetwork: config.bitcoin,
      unsignedPsbtHex: hex(tx.toPSBT()),
      feeSats: fee,
      outputSats: value - fee,
      broadcastAllowed: false,
      reason:
        "Unsigned recovery preparation. Confirm the real unspent outpoint and Bitcoin chain before signing.",
    };
  }
  return Object.freeze({ observe, prepareLock, prepareReclaim });
}
