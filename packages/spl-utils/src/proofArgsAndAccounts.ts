import { Asset, AssetProof, getAsset, getAssetProof } from "./mplAssetAPI";
import {
  concurrentMerkleTreeBeetFactory,
  concurrentMerkleTreeHeaderBeet,
  getCanopyDepth,
} from "@solana/spl-account-compression";
import { Connection, PublicKey, AccountMeta } from "@solana/web3.js";

export type ProofArgsAndAccountsArgs = {
  connection: Connection;
  assetId: PublicKey;
  assetEndpoint?: string;
  getAssetFn?: (url: string, assetId: PublicKey) => Promise<Asset | undefined>;
  getAssetProofFn?: (
    url: string,
    assetId: PublicKey
  ) => Promise<AssetProof | undefined>;
};

const WELL_KNOWN_CANOPY_URL =
  "https://shdw-drive.genesysgo.net/6tcnBSybPG7piEDShBcrVtYJDPSvGrDbVvXmXKpzBvWP/merkles.json";
let wellKnownCanopyCache: Record<string, number>;
const canopyCache: Record<string, Promise<number>> = {};
export async function proofArgsAndAccounts({
  connection,
  assetId,
  assetEndpoint,
  getAssetFn = getAsset,
  getAssetProofFn = getAssetProof,
}: ProofArgsAndAccountsArgs): Promise<{
  accounts: Record<string, PublicKey>;
  asset: Asset;
  args: {
    dataHash: number[];
    creatorHash: number[];
    root: number[];
    index: number;
  };
  remainingAccounts: AccountMeta[];
}> {
  // @ts-ignore
  const endpoint = assetEndpoint || connection._rpcEndpoint;
  const asset = await getAssetFn(endpoint, assetId);
  if (!asset) {
    throw new Error("No asset with ID " + assetId.toBase58());
  }
  const assetProof = await getAssetProofFn(endpoint, assetId);
  if (!assetProof) {
    throw new Error("No asset proof with ID " + assetId.toBase58());
  }
  const {
    compression: { leafId },
  } = asset;
  const { root, proof, treeId } = assetProof;

  const tree = treeId.toBase58();
  if (!canopyCache[tree] && !wellKnownCanopyCache[tree]) {
    canopyCache[tree] = (async () => {
      if (!wellKnownCanopyCache) {
        wellKnownCanopyCache = await (await fetch(WELL_KNOWN_CANOPY_URL)).json()
      }
      if (wellKnownCanopyCache[tree]) {
        return wellKnownCanopyCache[tree]
      }
      // IMPORTANT! Do not use `ConcurrentMerkleTreeAccount` class. It stupidly deserializes the whole merkle tree,
      // including reading the entire canopy. For large trees this will freeze the wallet app.
      let offset = 0;
      // Construct a new connection to ensure there's no caching. Don't want to cache
      // a giant account in AccountFetchCache accidentally. It also adds uneeded latency
      const newConn = new Connection(connection.rpcEndpoint);
      const buffer = (await newConn.getAccountInfo(treeId))!.data;
      const [versionedHeader, offsetIncr] =
        concurrentMerkleTreeHeaderBeet.deserialize(buffer);
      offset = offsetIncr;

      // Only 1 version available
      if (versionedHeader.header.__kind !== "V1") {
        throw Error(
          `Header has unsupported version: ${versionedHeader.header.__kind}`
        );
      }
      const header = versionedHeader.header.fields[0];
      const [_, offsetIncr2] = concurrentMerkleTreeBeetFactory(
        header.maxDepth,
        header.maxBufferSize
      ).deserialize(buffer, offset);
      offset = offsetIncr2;

      return getCanopyDepth(buffer.byteLength - offset);
    })();
  }
  const canopy = await (wellKnownCanopyCache?.[tree] || canopyCache[tree]);

  return {
    asset,
    args: {
      dataHash: asset.compression.dataHash!.toJSON().data,
      creatorHash: asset.compression.creatorHash!.toJSON().data,
      root: root.toBuffer().toJSON().data,
      index: leafId!,
    },
    accounts: {
      merkleTree: treeId,
    },
    remainingAccounts: proof.slice(0, proof.length - canopy).map((p) => {
      return {
        pubkey: p,
        isWritable: false,
        isSigner: false,
      };
    }),
  };
}
