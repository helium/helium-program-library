import { LazyDistributor } from "@helium/idls/lib/types/lazy_distributor";
import { AssetProof, getAssetProof } from "@helium/spl-utils";
import { Idl, Program } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import { ConcurrentMerkleTreeAccount } from "@solana/spl-account-compression";

export async function initializeCompressionRecipient({
  program,
  assetId,
  lazyDistributor,
  assetEndpoint,
  // @ts-ignore
  owner = program.provider.wallet.publicKey,
  getAssetProofFn = getAssetProof,
}: {
  program: Program<LazyDistributor>;
  assetId: PublicKey;
  lazyDistributor: PublicKey;
  owner?: PublicKey;
  assetEndpoint?: string;
  getAssetProofFn?: (
    url: string,
    assetId: PublicKey
  ) => Promise<AssetProof | undefined>;
}) {
  // @ts-ignore
  const endpoint = assetEndpoint || program.provider.connection._rpcEndpoint;
  const asset = await getAssetProofFn(endpoint, assetId);
  if (!asset) {
    throw new Error("No asset with ID " + assetId.toBase58());
  }
  const { root, proof, leaf, treeId, nodeIndex } = asset;
  const canopy = await (
    await ConcurrentMerkleTreeAccount.fromAccountAddress(
      program.provider.connection,
      treeId
    )
  ).getCanopyDepth();

  return program.methods
    .initializeCompressionRecipientV0({
      hash: leaf.toBuffer().toJSON().data,
      root: root.toBuffer().toJSON().data,
      index: nodeIndex,
    })
    .accounts({
      lazyDistributor,
      merkleTree: treeId,
      owner: owner,
      delegate: owner,
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
