import { HeliumEntityManager } from "@helium/idls/lib/types/helium_entity_manager";
import { Asset, AssetProof, getAsset, getAssetProof } from "@helium/spl-utils";
import { Program } from "@project-serum/anchor";
import { PublicKey } from "@solana/web3.js";
import { iotInfoKey, keyToAssetKey } from "../pdas";


export async function onboardIotHotspot({
  program,
  rewardableEntityConfig,
  assetId,
  maker,
  dao,
  assetEndpoint,
  getAssetFn = getAsset,
  getAssetProofFn = getAssetProof,
}: {
  program: Program<HeliumEntityManager>;
  assetId: PublicKey;
  rewardableEntityConfig: PublicKey;
  assetEndpoint?: string;
  maker: PublicKey;
  dao: PublicKey;
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
    content: { json_uri }
  } = asset;
  const [info] = iotInfoKey(rewardableEntityConfig, assetId);

  const makerAcc = await program.account.makerV0.fetchNullable(maker);

  const keyToAsset = (
    await keyToAssetKey(dao, json_uri.split("/").slice(-1)[0])
  )[0];
  return program.methods
    .onboardIotHotspotV0({
      hash: leaf.toBuffer().toJSON().data,
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
      dao,
      issuingAuthority: makerAcc?.issuingAuthority,
      keyToAsset,
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
