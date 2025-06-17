import { IdlTypes, Program } from "@coral-xyz/anchor";
import { WelcomePack } from "@helium/idls/lib/types/welcome_pack";
import { PROGRAM_ID, recipientKey } from "@helium/lazy-distributor-sdk";
import { PROGRAM_ID as MINI_FANOUT_PROGRAM_ID, miniFanoutKey, queueAuthorityKey } from "@helium/mini-fanout-sdk";
import { Asset, AssetProof, HNT_MINT, proofArgsAndAccounts } from "@helium/spl-utils";
import { SPL_ACCOUNT_COMPRESSION_PROGRAM_ID } from "@solana/spl-account-compression";
import { ASSOCIATED_TOKEN_PROGRAM_ID, getAssociatedTokenAddressSync, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import { ClaimApprovalV0 } from "..";
import { BUBBLEGUM_PROGRAM_ID, NOOP_PROGRAM_ID } from "./initializeWelcomePack";

export type RewardSplit = IdlTypes<WelcomePack>["miniFanoutShareArgV0"];

export async function claimWelcomePack({
  program,
  welcomePack,
  assetEndpoint,
  claimApproval,
  claimApprovalSignature,
  claimer,
  taskQueue,
  // @ts-ignore
  payer = program.provider.wallet.publicKey,
  ...rest
}: {
  claimer: PublicKey;
  claimApproval: ClaimApprovalV0;
  claimApprovalSignature: Buffer;
  welcomePack: PublicKey;
  program: Program<WelcomePack>;
  payer?: PublicKey;
  taskQueue: PublicKey;
  assetEndpoint?: string;
  getAssetFn?: (url: string, assetId: PublicKey) => Promise<Asset | undefined>;
  getAssetProofFn?: (
    url: string,
    assetId: PublicKey
  ) => Promise<AssetProof | undefined>;
}) {
  const welcomePackAcc = await program.account.welcomePackV0.fetch(welcomePack)
  const assetId = welcomePackAcc.asset
  const {
    args,
    accounts,
    remainingAccounts,
  } = await proofArgsAndAccounts({
    connection: program.provider.connection,
    assetId,
    ...rest,
  });

  const miniFanout = miniFanoutKey(welcomePack, assetId.toBuffer())[0]
  const lazyDistributorAcc = await program.account.lazyDistributorV0.fetch(welcomePackAcc.lazyDistributor)
  return program.methods
    .claimWelcomePackV0({
      ...args,
      claimApproval,
      claimSignature: claimApprovalSignature.toJSON().data,
    })
    .accountsStrict({
      merkleTree: accounts.merkleTree,
      welcomePack: welcomePack,
      assetReturnAddress: welcomePackAcc.assetReturnAddress.equals(PublicKey.default) ? claimer : welcomePackAcc.assetReturnAddress,
      recipient: recipientKey(welcomePackAcc.lazyDistributor, assetId)[0],
      rewardsRecipient: welcomePackAcc.rewardsSplit.length > 1 ? miniFanout : welcomePackAcc.rewardsSplit[0].wallet.equals(PublicKey.default) ? claimer : welcomePackAcc.rewardsSplit[0].wallet,
      tokenAccount: getAssociatedTokenAddressSync(lazyDistributorAcc.rewardsMint, miniFanout, true),
      queueAuthority: queueAuthorityKey()[0],
      taskQueue,
      rewardsMint: lazyDistributorAcc.rewardsMint,
      lazyDistributor: welcomePackAcc.lazyDistributor,
      owner: welcomePackAcc.owner,
      rentRefund: welcomePackAcc.rentRefund,
      claimer,
      lazyDistributorProgram: PROGRAM_ID,
      treeAuthority: PublicKey.findProgramAddressSync([accounts.merkleTree.toBuffer()], BUBBLEGUM_PROGRAM_ID)[0],
      logWrapper: NOOP_PROGRAM_ID,
      compressionProgram: SPL_ACCOUNT_COMPRESSION_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
      miniFanoutProgram: MINI_FANOUT_PROGRAM_ID,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      tokenProgram: TOKEN_PROGRAM_ID,
      bubblegumProgram: BUBBLEGUM_PROGRAM_ID
    })
    .remainingAccounts(remainingAccounts);
}
