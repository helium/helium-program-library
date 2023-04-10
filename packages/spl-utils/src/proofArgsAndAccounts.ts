import { Asset, AssetProof, getAsset, getAssetProof } from "./mplAssetAPI";
import { ConcurrentMerkleTreeAccount } from "@solana/spl-account-compression";
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
  const { root, proof, leaf, treeId } = assetProof;
  const canopy = await (
    await ConcurrentMerkleTreeAccount.fromAccountAddress(connection, treeId)
  ).getCanopyDepth();

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
