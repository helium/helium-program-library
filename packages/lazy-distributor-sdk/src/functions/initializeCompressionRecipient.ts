import { LazyDistributor } from "@helium/idls/lib/types/lazy_distributor";
import { AssetProof, getAssetProof } from "@helium/spl-utils";
import {
  Idl, Program
} from "@project-serum/anchor";
import { PublicKey } from "@solana/web3.js";

export async function initializeCompressionRecipient({
  program,
  assetId,
  lazyDistributor,
  // @ts-ignore
  owner = program.provider.wallet.publicKey,
  getAssetProofFn = getAssetProof,
}: {
  program: Program<LazyDistributor>;
  assetId: PublicKey;
  lazyDistributor: PublicKey;
  owner?: PublicKey;
  getAssetProofFn?: (assetId: PublicKey) => Promise<AssetProof | undefined>;
}) {
  const asset = await getAssetProofFn(assetId);
  if (!asset) {
    throw new Error("No asset with ID " + assetId.toBase58());
  }
  const { root, proof, leaf, treeId, nodeIndex } = asset;

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
      proof.map((p) => {
        return {
          pubkey: p,
          isWritable: false,
          isSigner: false,
        };
      })
    );
}
