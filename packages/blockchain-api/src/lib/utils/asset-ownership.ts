import { getAsset, type Asset } from "@helium/spl-utils";
import type { PublicKey } from "@solana/web3.js";

/** The error builder an ownership refusal is raised through. */
type AssetOwnerErrors = {
  UNAUTHORIZED: (opts: { message: string }) => Error;
};

/** `fetchOwnedAsset` also refuses an asset the endpoint does not know. */
type OwnedAssetErrors = AssetOwnerErrors & {
  NOT_FOUND: (opts: { message: string }) => Error;
};

/**
 * A cNFT's current owner in base58. The asset endpoints hand the field back
 * either already decoded or as the string it arrived as, so both are accepted.
 */
export function assetOwnerAddress(asset: Asset): string {
  const { owner } = asset.ownership;
  return typeof owner === "string" ? owner : owner.toBase58();
}

/**
 * Refuse a caller that is not the cNFT's owner, and hand back the owner it
 * checked so the address is derived once.
 *
 * `expectedOwner` is the authority the endpoint builds its instruction for: the
 * caller's own wallet, or the vault of the multisig it proposes through, which
 * is the owner on chain while the caller is only a member of it. `message` is
 * the endpoint's own wording, because the endpoints name different things the
 * wallet failed to own.
 */
export function assertAssetOwner({
  asset,
  expectedOwner,
  message,
  errors,
}: {
  asset: Asset;
  expectedOwner: string;
  message: string;
  errors: AssetOwnerErrors;
}): string {
  const ownerAddress = assetOwnerAddress(asset);
  if (ownerAddress !== expectedOwner) {
    throw errors.UNAUTHORIZED({ message });
  }
  return ownerAddress;
}

/**
 * Fetch a cNFT and refuse the caller unless `expectedOwner` owns it, handing
 * back the asset so the endpoint never pays for a second DAS round-trip.
 *
 * `assetEndpoint` comes in rather than being read from the environment here so
 * this module stays importable under the unit runner, which resolves no `@/`
 * aliases; endpoints pass `getAssetEndpoint()` from `@/lib/solana`.
 * `getAssetFn` exists for tests.
 */
export async function fetchOwnedAsset({
  assetEndpoint,
  assetId,
  expectedOwner,
  message,
  errors,
  getAssetFn = getAsset,
}: {
  assetEndpoint: string;
  assetId: PublicKey;
  expectedOwner: string;
  message: string;
  errors: OwnedAssetErrors;
  getAssetFn?: (url: string, assetId: PublicKey) => Promise<Asset | undefined>;
}): Promise<Asset> {
  const asset = await getAssetFn(assetEndpoint, assetId);
  if (!asset) {
    throw errors.NOT_FOUND({ message: "Asset not found" });
  }
  assertAssetOwner({ asset, expectedOwner, message, errors });
  return asset;
}
