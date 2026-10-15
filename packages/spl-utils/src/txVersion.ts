import { Connection, PublicKey } from "@solana/web3.js";

export type SignerTransactionVersion = "legacy" | 0 | 1;
export type TxVersionOption = 0 | 1 | "auto";

// Feature gate `enable_tx_v1`.
const TX_V1_FEATURE_GATE = new PublicKey(
  "txv1aq4pp281K9um3tnPgkfX8UqtFT6wcVW3hNezGLL"
);

// Per RPC endpoint, for the process lifetime (no TTL).
const detectedVersions = new Map<string, Promise<0 | 1>>();
const warnedEndpoints = new Set<string>();
const loggedCapabilitySets = new Set<string>();
let envTxVersion: TxVersionOption | undefined;

// Env is read once and only under Node; browser bundles have no process.env.
function envTxVersionOption(): TxVersionOption {
  if (envTxVersion === undefined) {
    const env =
      typeof process !== "undefined" ? process.env?.HPL_TX_VERSION : undefined;
    if (!env || env === "auto") envTxVersion = "auto";
    else if (env === "v0") envTxVersion = 0;
    else if (env === "v1") envTxVersion = 1;
    // A typo in the kill switch must not quietly leave v1 on.
    else throw new Error(`HPL_TX_VERSION must be v0, v1 or auto; got ${env}`);
  }
  return envTxVersion;
}

// Signer capability (4.2 SPEC §2.2). A wallet-adapter object carries its own
// set, where null means legacy only; a keypair-backed wallet (Anchor
// NodeWallet) carries `payer` and can sign anything; any other signer is
// assumed to stop at v0.
export function resolveSignerVersions(
  wallet: any
): ReadonlySet<SignerTransactionVersion> {
  let versions: Set<SignerTransactionVersion>;
  if (wallet && "supportedTransactionVersions" in wallet) {
    versions = new Set(wallet.supportedTransactionVersions ?? ["legacy"]);
  } else if (wallet?.payer) {
    versions = new Set<SignerTransactionVersion>(["legacy", 0, 1]);
  } else {
    versions = new Set<SignerTransactionVersion>(["legacy", 0]);
  }

  // Logged so the team learns when a wallet vendor adds v1. A wallet-signed tx
  // is capped at v0 anyway, because web3.js 1.x cannot serialize a
  // wallet-signed v1 tx. Keyed on the capability set, not the signer: signers
  // come from request input, so a per-signer key grows without bound.
  const signer = wallet?.publicKey?.toBase58?.() ?? "unknown";
  const capabilitySet = [...versions].map(String).sort().join(",");
  if (!loggedCapabilitySets.has(capabilitySet)) {
    loggedCapabilitySets.add(capabilitySet);
    console.info(
      `spl-utils: signer ${signer} supports transaction versions [${[
        ...versions,
      ].join(", ")}]`
    );
  }
  return versions;
}

// Both halves are needed. The gate account shows the feature is active, and
// solana-core >= 4.2 shows the node parses v1: a fork can pass an active gate
// through from mainnet on an older node line. The check errs towards v0:
// surfpool 1.5.0 reports 4.1.2 and resolves v0, although its runtime takes v1.
async function detectTxVersion(connection: Connection): Promise<0 | 1> {
  const [version, gate, slot] = await Promise.all([
    connection.getVersion(),
    connection.getAccountInfo(TX_V1_FEATURE_GATE),
    connection.getSlot(),
  ]);
  const [major, minor] = version["solana-core"].split(".").map(Number);
  const nodeSupportsV1 = major > 4 || (major === 4 && minor >= 2);
  // Feature account data is bincode Option<u64>: tag 1, then activation slot.
  const gateActive =
    !!gate &&
    gate.data[0] === 1 &&
    gate.data.readBigUInt64LE(1) <= BigInt(slot);
  return nodeSupportsV1 && gateActive ? 1 : 0;
}

// A failed detection is not cached, so a later call retries; it still warns
// only once per endpoint and never refuses to build.
function detectedTxVersion(connection: Connection): Promise<0 | 1> {
  const endpoint = connection.rpcEndpoint;
  let detected = detectedVersions.get(endpoint);
  if (!detected) {
    detected = detectTxVersion(connection).catch((e) => {
      detectedVersions.delete(endpoint);
      if (!warnedEndpoints.has(endpoint)) {
        warnedEndpoints.add(endpoint);
        console.warn(
          `spl-utils: transaction version detection failed on ${endpoint}, building v0`,
          e
        );
      }
      return 0 as const;
    });
    detectedVersions.set(endpoint, detected);
  }
  return detected;
}

// Precedence (4.2 SPEC §2.2): per-call `version` > HPL_TX_VERSION=v0 (kill
// switch) > signer capability > HPL_TX_VERSION=v1 or node detection. The
// signer check runs before any RPC.
export async function resolveTxVersion(
  connection: Connection,
  { version = "auto", wallet }: { version?: TxVersionOption; wallet?: any } = {}
): Promise<0 | 1> {
  // Read before the pin check so a typo throws on pinned calls too.
  const env = envTxVersionOption();
  if (version !== "auto") return version;
  if (env === 0) return 0;
  if (wallet && !resolveSignerVersions(wallet).has(1)) return 0;
  const nodeVersion = env === 1 ? 1 : await detectedTxVersion(connection);
  if (nodeVersion === 0 || !wallet) return nodeVersion;
  // web3.js 1.x cannot serialize a v1 tx signed by a wallet adapter.
  return wallet.payer ? 1 : 0;
}

/** Test hook: clears the cached env, node, and signer versions. Exported for tests; no stability guarantee. */
export function resetTxVersionCache(): void {
  detectedVersions.clear();
  warnedEndpoints.clear();
  loggedCapabilitySets.clear();
  envTxVersion = undefined;
}
