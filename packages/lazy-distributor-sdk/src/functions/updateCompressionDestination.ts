import { Idl, Program } from "@coral-xyz/anchor";
import { LazyDistributor } from "@helium/idls/lib/types/lazy_distributor";
import { Asset, AssetProof, proofArgsAndAccounts } from "@helium/spl-utils";
import { PublicKey } from "@solana/web3.js";
import { recipientKey } from "../pdas";

export async function updateCompressionDestination<IDL extends Idl>({
  program,
  assetId,
  lazyDistributor,
  rewardsMint,
  payer,
  destination,
  ...rest
}: {
  program: Program<LazyDistributor>;
  assetId: PublicKey;
  rewardsMint?: PublicKey;
  assetEndpoint?: string;
  lazyDistributor: PublicKey;
  owner?: PublicKey;
  payer?: PublicKey;
  destination: PublicKey | null;
  getAssetFn?: (url: string, assetId: PublicKey) => Promise<Asset | undefined>;
  getAssetProofFn?: (
    url: string,
    assetId: PublicKey
  ) => Promise<AssetProof | undefined>;
}) {
  const {
    asset: {
      ownership: { owner },
    },
    args,
    accounts,
    remainingAccounts,
  } = await proofArgsAndAccounts({
    connection: program.provider.connection,
    assetId,
    ...rest,
  });

  return program.methods
    .updateCompressionDestinationV0({
      ...args,
    })
    .accountsPartial({
      ...accounts,
      owner,
      recipient: recipientKey(lazyDistributor, assetId)[0],
      destination: destination == null ? PublicKey.default : destination,
    })
    .remainingAccounts(remainingAccounts);
}
