import { Connection, PublicKey } from "@solana/web3.js";
import { env } from "@/lib/env";
import { hasRewardContract } from "@/lib/queries/hotspots";
import { proofArgsAndAccounts } from "@helium/spl-utils";
import {
  getAssetIdFromPubkey,
  getBubblegumAuthorityPDA,
  validateHeliumHotspot,
} from "@/lib/utils/hotspot-helpers";
import { vaultPda } from "../../squads/procedures/helpers";

/** The typed error builders the hotspot cNFT preamble throws. */
type HotspotCnftErrors = {
  NOT_FOUND: (opts: { message: string }) => Error;
  BAD_REQUEST: (opts: { message: string }) => Error;
  UNAUTHORIZED: (opts: { message: string }) => Error;
  CONFLICT: (opts: { message: string }) => Error;
};

/**
 * Shared preamble for the burn/transfer hotspot endpoints: resolve the cNFT,
 * validate it is a Helium hotspot owned by the expected authority (the wallet,
 * or the multisig vault in propose mode), reject one with an active reward
 * contract, and derive the bubblegum accounts needed to build the leaf
 * instruction. `conflictMessage` is the reward-contract guard message — the only
 * wording that differs between the two endpoints.
 *
 * The reward-contract lookup is independent of the Merkle proof, so the two run
 * concurrently and are awaited together at the guard.
 */
export const resolveOwnedHotspotCnft = async ({
  walletAddress,
  hotspotPubkey,
  multisig,
  conflictMessage,
  errors,
}: {
  walletAddress: string;
  hotspotPubkey: string;
  multisig?: string;
  conflictMessage: string;
  errors: HotspotCnftErrors;
}) => {
  const assetId = await getAssetIdFromPubkey(hotspotPubkey);
  if (!assetId) {
    throw errors.NOT_FOUND({ message: "Hotspot not found" });
  }

  let payerPubkey: PublicKey;
  let multisigPda: PublicKey | undefined;
  try {
    payerPubkey = new PublicKey(walletAddress);
    multisigPda = multisig ? new PublicKey(multisig) : undefined;
  } catch {
    throw errors.BAD_REQUEST({ message: "Invalid public key format" });
  }

  const connection = new Connection(env.SOLANA_RPC_URL);
  const assetEndpoint = env.ASSET_ENDPOINT || connection.rpcEndpoint;

  const [{ asset, args, accounts, remainingAccounts }, contractExists] =
    await Promise.all([
      proofArgsAndAccounts({
        connection,
        assetId: new PublicKey(assetId),
        assetEndpoint,
      }),
      hasRewardContract(hotspotPubkey),
    ]);

  if (!asset) {
    throw errors.NOT_FOUND({ message: "Asset not found" });
  }
  if (!validateHeliumHotspot(asset)) {
    throw errors.BAD_REQUEST({
      message: "Asset is not a valid Helium hotspot",
    });
  }

  const ownerAddress =
    typeof asset.ownership.owner === "string"
      ? asset.ownership.owner
      : asset.ownership.owner.toBase58();

  // In Squads propose mode the on-chain owner must be the multisig's vault
  // (walletAddress is only the proposing member); otherwise the wallet itself.
  const expectedOwner = multisigPda ? vaultPda(multisigPda) : payerPubkey;
  if (ownerAddress !== expectedOwner.toBase58()) {
    throw errors.UNAUTHORIZED({
      message: multisigPda
        ? "Multisig vault is not the owner of this hotspot"
        : "Wallet is not the owner of this hotspot",
    });
  }

  if (contractExists) {
    throw errors.CONFLICT({ message: conflictMessage });
  }

  const leafOwner = new PublicKey(ownerAddress);
  const leafDelegate = asset.ownership.delegate
    ? typeof asset.ownership.delegate === "string"
      ? new PublicKey(asset.ownership.delegate)
      : asset.ownership.delegate
    : leafOwner;

  const merkleTree = accounts.merkleTree;
  const treeAuthority = await getBubblegumAuthorityPDA(merkleTree);

  const hotspotName = asset.content?.metadata?.name || "Hotspot";

  return {
    connection,
    payerPubkey,
    multisigPda,
    assetId,
    asset,
    args,
    remainingAccounts,
    merkleTree,
    treeAuthority,
    leafOwner,
    leafDelegate,
    hotspotName,
  };
};
