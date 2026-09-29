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
const loggedSigners = new Set<string>();
let envTxVersion: TxVersionOption | undefined;
let walletSignedTxVersionCeiling: 0 | 1 = 0;

// Env is read once and only under Node; browser bundles have no process.env.
function envTxVersionOption(): TxVersionOption {
  if (envTxVersion === undefined) {
    const env =
      typeof process !== "undefined" ? process.env?.HPL_TX_VERSION : undefined;
    envTxVersion = env === "v0" ? 0 : env === "v1" ? 1 : "auto";
  }
  return envTxVersion;
}

// Called once by the host app. Caps wallet-shaped signers only; a
// keypair-backed wallet is never capped.
export function setWalletSignedTxVersionCeiling(ceiling: 0 | 1): void {
  walletSignedTxVersionCeiling = ceiling;
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

  // Logged so the team learns when a wallet vendor adds v1 and a ceiling-raise
  // smoke is due; the ceiling never moves on its own.
  const signer = wallet?.publicKey?.toBase58?.() ?? "unknown";
  if (!loggedSigners.has(signer)) {
    loggedSigners.add(signer);
    console.info(
      `spl-utils: signer ${signer} supports transaction versions [${[
        ...versions,
      ].join(", ")}]`
    );
  }
  return versions;
}

// Both halves are needed: surfpool passes the gate account through from
// mainnet (so it reads active) while its runtime cannot take v1.
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

// Precedence (4.2 SPEC §2.2): per-call `version` > HPL_TX_VERSION > the
// highest version both the node and the signer support, capped by the
// wallet ceiling for wallet-shaped signers. Without a wallet only the node
// is consulted.
export async function resolveTxVersion(
  connection: Connection,
  { version = "auto", wallet }: { version?: TxVersionOption; wallet?: any } = {}
): Promise<0 | 1> {
  if (version !== "auto") return version;
  const env = envTxVersionOption();
  if (env !== "auto") return env;

  const nodeVersion = await detectedTxVersion(connection);
  if (nodeVersion === 0 || !wallet) return nodeVersion;
  if (!resolveSignerVersions(wallet).has(1)) return 0;
  return wallet.payer ? 1 : walletSignedTxVersionCeiling;
}

export function resetTxVersionCache(): void {
  detectedVersions.clear();
  warnedEndpoints.clear();
  loggedSigners.clear();
  envTxVersion = undefined;
}
