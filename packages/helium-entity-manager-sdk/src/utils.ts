import { Asset } from "@helium/spl-utils";
import { HeliumEntityManager } from "@helium/idls/lib/types/helium_entity_manager";
import { IdlTypes } from "@project-serum/anchor";

type MetadataArgs = IdlTypes<HeliumEntityManager>["MetadataArgs"];

export function assetToMetadataArgs(asset: Asset): MetadataArgs {
  const metadata: MetadataArgs = {
    name: asset.content.metadata.name,
    symbol: asset.content.metadata.symbol,
    uri: asset.content.json_uri,
    sellerFeeBasisPoints: asset.royalty.basis_points,
    primarySaleHappened: asset.royalty.primary_sale_happened,
    isMutable: asset.mutable,
    editionNonce: asset.supply.edition_nonce,
    tokenStandard: { nonFungible: {} },
    collection: asset.grouping ? {
      key: asset.grouping,
      verified: true
    } : null,
    uses: null, // TODO: support uses
    tokenProgramVersion: { original: {} },
    creators: asset.creators,
  };

  return metadata
}