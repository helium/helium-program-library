import { LazyDistributor } from "@helium/idls/lib/types/lazy_distributor";
import { Asset, getAsset, getAssetProof, AssetProof } from "@helium/spl-utils";
import { Idl, Program } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import { ConcurrentMerkleTreeAccount } from "@solana/spl-account-compression";

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
  getAssetFn?: (url: string, assetId: PublicKey) => Promise<Asset | undefined>;
  getAssetProofFn?: (
    url: string,
    assetId: PublicKey
  ) => Promise<AssetProof | undefined>;
}) {
  // @ts-ignore
  const endpoint = program.provider.connection._rpcEndpoint;
  const asset = await getAssetFn(endpoint, assetId);
  if (!asset) {
    throw new Error("No asset with ID " + assetId.toBase58());
  }
  const assetProof = await getAssetProofFn(endpoint, assetId);
  if (!assetProof) {
    throw new Error("No asset proof with ID " + assetId.toBase58());
  }
  const { root, proof, leaf, treeId, nodeIndex } = assetProof;
  const {
    ownership: { owner },
  } = asset;

  const canopy = await (
    await ConcurrentMerkleTreeAccount.fromAccountAddress(program.provider.connection, treeId)
  ).getCanopyDepth();

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
      proof.slice(0, proof.length - canopy).map((p) => {
        return {
          pubkey: p,
          isWritable: false,
          isSigner: false,
        };
      })
    );
}
