import { LazyDistributor } from "@helium/idls/lib/types/lazy_distributor";
import { Asset, getAsset, getAssetProof, AssetProof } from "@helium/spl-utils";
import { Idl, Program } from "@project-serum/anchor";
import { PublicKey } from "@solana/web3.js";

export async function distributeCompressionRewards<IDL extends Idl>({
  program,
  assetId,
  lazyDistributor,
  getAssetFn = getAsset,
  getAssetProofFn = getAssetProof,
}: {
  program: Program<LazyDistributor>;
  assetId: PublicKey;
  lazyDistributor: PublicKey;
  owner?: PublicKey;
  getAssetFn?: (assetId: PublicKey) => Promise<Asset | undefined>;
  getAssetProofFn?: (assetId: PublicKey) => Promise<AssetProof | undefined>;
}) {
  const asset = await getAssetFn(assetId);
  if (!asset) {
    throw new Error("No asset with ID " + assetId.toBase58());
  }
  const assetProof = await getAssetProofFn(assetId);
  if (!assetProof) {
    throw new Error("No asset proof with ID " + assetId.toBase58());
  }
  const { root, proof, leaf, treeId, nodeIndex } = assetProof;
  const { ownership: { owner } } = asset;

  return program.methods
    .distributeCompressionRewardsV0({
      hash: leaf.toBuffer().toJSON().data,
      root: root.toBuffer().toJSON().data,
      index: nodeIndex,
    })
    .accounts({
      common: {
        lazyDistributor,
        owner,
      },
      merkleTree: treeId,
    })
    .remainingAccounts(
      proof.map((p) => {
        return {
          pubkey: p,
          isWritable: false,
          isSigner: false,
        };
      })
    );
}
