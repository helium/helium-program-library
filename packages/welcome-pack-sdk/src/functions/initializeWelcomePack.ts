import { BN, IdlTypes, Program } from "@coral-xyz/anchor";
import { WelcomePack } from "@helium/idls/lib/types/welcome_pack";
import { PROGRAM_ID as LAZY_DISTRIBUTOR_PROGRAM_ID, recipientKey } from "@helium/lazy-distributor-sdk";
import { Asset, AssetProof, proofArgsAndAccounts } from "@helium/spl-utils";
import { SPL_ACCOUNT_COMPRESSION_PROGRAM_ID } from "@solana/spl-account-compression";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import { userWelcomePacksKey, welcomePackKey } from "../pdas";

export type RewardSplit = IdlTypes<WelcomePack>["miniFanoutShareArgV0"];
export const BUBBLEGUM_PROGRAM_ID = new PublicKey("BGUMAp9Gq7iTEuizy4pqaxsTyUCBK68MDfK752saRPUY");
export const NOOP_PROGRAM_ID = new PublicKey("noopb9bkMVfRPU8AsbpTUg8AQkHtKwMYZiFUjNRtMmV");

export async function initializeWelcomePack({
  program,
  assetId,
  lazyDistributor,
  assetEndpoint,
  solAmount,
  rewardsSplit,
  rewardsSchedule,
  rentRefund,
  assetReturnAddress,
  owner,
  // @ts-ignore
  payer = program.provider.wallet.publicKey,
  ...rest
}: {
  owner: PublicKey;
  solAmount: BN;
  rentRefund: PublicKey;
  assetReturnAddress: PublicKey;
  rewardsSplit: RewardSplit[];
  rewardsSchedule: string;
  program: Program<WelcomePack>;
  assetId: PublicKey;
  lazyDistributor: PublicKey;
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
      ownership: { owner: assetOwner },
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

  const userWelcomePacksK = userWelcomePacksKey(owner)[0]
  const userWelcomePacks = await program.account.userWelcomePacksV0.fetchNullable(userWelcomePacksK)

  return program.methods
    .initializeWelcomePackV0({
      ...args,
      solAmount,
      rewardsSplit,
      rewardsSchedule,
    })
    .accountsStrict({
      owner,
      merkleTree: accounts.merkleTree,
      rentRefund,
      assetReturnAddress,
      leafOwner: assetOwner,
      payer,
      recipient: recipientKey(lazyDistributor, assetId)[0],
      welcomePack: welcomePackKey(owner, userWelcomePacks?.nextId || 0)[0],
      lazyDistributor,
      treeAuthority: PublicKey.findProgramAddressSync([accounts.merkleTree.toBuffer()], BUBBLEGUM_PROGRAM_ID)[0],
      logWrapper: NOOP_PROGRAM_ID,
      compressionProgram: SPL_ACCOUNT_COMPRESSION_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
      bubblegumProgram: BUBBLEGUM_PROGRAM_ID,
      userWelcomePacks: userWelcomePacksK,
      lazyDistributorProgram: LAZY_DISTRIBUTOR_PROGRAM_ID
    })
    .remainingAccounts(remainingAccounts);
}
