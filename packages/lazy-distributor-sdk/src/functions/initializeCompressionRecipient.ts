import { LazyDistributor } from "@helium/idls/lib/types/lazy_distributor";
import { Asset, AssetProof, getAsset, getAssetProof } from "@helium/spl-utils";
import { BN, Idl, Program } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import { ConcurrentMerkleTreeAccount } from "@solana/spl-account-compression";
import { recipientKey } from "../pdas";
import { getLeafAssetId } from "@metaplex-foundation/mpl-bubblegum";

export async function initializeCompressionRecipient({
  program,
  assetId,
  lazyDistributor,
  assetEndpoint,
  // @ts-ignore
  owner = program.provider.wallet.publicKey,
  // @ts-ignore
  payer = program.provider.wallet.publicKey,
  getAssetFn = getAsset,
  getAssetProofFn = getAssetProof,
}: {
  program: Program<LazyDistributor>;
  assetId: PublicKey;
  lazyDistributor: PublicKey;
  owner?: PublicKey;
  payer?: PublicKey;
  assetEndpoint?: string;
  getAssetFn?: (url: string, assetId: PublicKey) => Promise<Asset | undefined>;
  getAssetProofFn?: (
    url: string,
    assetId: PublicKey
  ) => Promise<AssetProof | undefined>;
}) {
  // @ts-ignore
  const endpoint = assetEndpoint || program.provider.connection._rpcEndpoint;

  const asset = await getAssetFn(endpoint, assetId);
  if (!asset) {
    throw new Error("No asset with ID " + assetId.toBase58());
  }

  const assetProof = await getAssetProofFn(endpoint, assetId);
  if (!assetProof) {
    throw new Error("No asset with ID " + assetId.toBase58());
  }
  const {
    compression: { leafId },
  } = asset;
  const { root, proof, leaf, treeId } = assetProof;
  const canopy = await (
    await ConcurrentMerkleTreeAccount.fromAccountAddress(
      program.provider.connection,
      treeId
    )
  ).getCanopyDepth();

  const recipient = recipientKey(lazyDistributor, assetId)[0];

  return program.methods
    .initializeCompressionRecipientV0({
      dataHash: asset.compression.dataHash!.toJSON().data,
      creatorHash: asset.compression.creatorHash!.toJSON().data,
      root: root.toBuffer().toJSON().data,
      index: leafId!,
    })
    .accounts({
      lazyDistributor,
      merkleTree: treeId,
      owner: owner,
      delegate: owner,
      recipient,
      payer,
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
