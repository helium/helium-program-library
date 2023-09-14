import { Idl, Program } from "@coral-xyz/anchor";
import { LazyDistributor } from "@helium/idls/lib/types/lazy_distributor";
import { Asset, AssetProof, proofArgsAndAccounts } from "@helium/spl-utils";
import { PublicKey } from "@solana/web3.js";

export async function distributeCompressionRewards<IDL extends Idl>({
  program,
  assetId,
  lazyDistributor,
  rewardsMint,
  ...rest
}: {
  program: Program<LazyDistributor>;
  assetId: PublicKey;
  rewardsMint?: PublicKey;
  assetEndpoint?: string;
  lazyDistributor: PublicKey;
  owner?: PublicKey;
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
    .distributeCompressionRewardsV0({
      ...args,
    })
    .accounts({
      ...accounts,
      common: {
        lazyDistributor,
        rewardsMint,
        owner,
      },
    })
    .remainingAccounts(remainingAccounts);
}
