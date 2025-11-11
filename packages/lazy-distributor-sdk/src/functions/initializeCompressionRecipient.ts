import { Program } from "@coral-xyz/anchor";
import { LazyDistributor } from "@helium/idls/lib/types/lazy_distributor";
import { Asset, AssetProof, proofArgsAndAccounts } from "@helium/spl-utils";
import { PublicKey } from "@solana/web3.js";
import { recipientKey } from "../pdas";

export async function initializeCompressionRecipient({
  program,
  assetId,
  lazyDistributor,
  assetEndpoint,
  // @ts-ignore
  payer = program.provider.wallet.publicKey,
  ...rest
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
    assetEndpoint,
    ...rest,
  });
  const recipient = recipientKey(lazyDistributor, assetId)[0];

  return program.methods
    .initializeCompressionRecipientV0({
      ...args,
    })
    .accountsPartial({
      ...accounts,
      lazyDistributor,
      owner: new PublicKey(owner),
      delegate: new PublicKey(owner),
      recipient,
      payer,
    })
    .remainingAccounts(remainingAccounts);
}
