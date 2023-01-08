import { HeliumEntityManager } from "@helium/idls/lib/types/helium_entity_manager";
import { Asset, getAsset, getAssetProof, AssetProof } from "@helium/spl-utils";
import { BN, Idl, Program } from "@project-serum/anchor";
import { PublicKey } from "@solana/web3.js";
import Address from "@helium/address";
import { iotInfoKey } from "../pdas";
import { assetToMetadataArgs } from "../utils";

export async function onboardIotHotspot({
  program,
  rewardableEntityConfig,
  assetId,
  maker,
  assetEndpoint,
  getAssetFn = getAsset,
  getAssetProofFn = getAssetProof,
}: {
  program: Program<HeliumEntityManager>;
  assetId: PublicKey;
  rewardableEntityConfig: PublicKey;
  assetEndpoint?: string;
  maker: PublicKey;
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
    throw new Error("No asset proof with ID " + assetId.toBase58());
  }
  const { root, proof, leaf, treeId, nodeIndex } = assetProof;
  const {
    ownership: { owner },
    content: { json_uri: uri },
  } = asset;
  const eccCompact = uri.split("/").slice(-1)[0];

  const [info] = iotInfoKey(rewardableEntityConfig, eccCompact);

  const makerAcc = await program.account.makerV0.fetchNullable(maker);

  const anchorMetadata = assetToMetadataArgs(asset);
  return program.methods
    .onboardIotHotspotV0({
      metadata: anchorMetadata,
      root: root.toBuffer().toJSON().data,
      index: nodeIndex,
    })
    .accounts({
      // hotspot: assetId,
      rewardableEntityConfig,
      hotspotOwner: owner,
      iotInfo: info,
      merkleTree: treeId,
      maker,
      authority: makerAcc?.authority
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
