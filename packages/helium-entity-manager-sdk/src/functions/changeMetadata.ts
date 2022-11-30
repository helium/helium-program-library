import { HeliumEntityManager } from "@helium/idls/lib/types/helium_entity_manager";
import { Asset, getAsset, getAssetProof, AssetProof } from "@helium/spl-utils";
import { BN, Idl, Program } from "@project-serum/anchor";
import { PublicKey } from "@solana/web3.js";
import Address from "@helium/address"
import { hotspotStorageKey } from "../pdas";

export async function changeMetadata({
  program,
  hotspotConfig,
  assetId,
  location,
  elevation,
  gain,
  getAssetFn = getAsset,
  getAssetProofFn = getAssetProof,
}: {
  program: Program<HeliumEntityManager>;
  location: BN | null;
  elevation: number | null;
  gain: number | null;
  assetId: PublicKey;
  hotspotConfig: PublicKey;
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
    content: { uri },
  } = asset;
  const eccCompact = uri.split("/").slice(-1)[0];

  const [storage] = hotspotStorageKey(hotspotConfig, eccCompact);

  return program.methods
    .changeMetadataV0({
      location,
      elevation,
      gain,
      hash: leaf.toBuffer().toJSON().data,
      root: root.toBuffer().toJSON().data,
      index: nodeIndex,
    })
    .accounts({
      hotspot: assetId,
      hotspotConfig,
      hotspotOwner: owner,
      storage,
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
