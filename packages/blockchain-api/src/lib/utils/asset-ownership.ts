import type { Asset } from "@helium/spl-utils";

/** The error builder an ownership refusal is raised through. */
type AssetOwnerErrors = {
  UNAUTHORIZED: (opts: { message: string }) => Error;
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
