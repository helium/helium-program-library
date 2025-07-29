import { IdlTypes, Program } from "@coral-xyz/anchor";
import { WelcomePack } from "@helium/idls/lib/types/welcome_pack";
import { PROGRAM_ID, recipientKey } from "@helium/lazy-distributor-sdk";
import { PROGRAM_ID as MINI_FANOUT_PROGRAM_ID, miniFanoutKey, queueAuthorityKey } from "@helium/mini-fanout-sdk";
import { Asset, AssetProof, proofArgsAndAccounts } from "@helium/spl-utils";
import { Tuktuk } from "@helium/tuktuk-idls/lib/types/tuktuk";
import { nextAvailableTaskIds, taskKey, taskQueueAuthorityKey } from "@helium/tuktuk-sdk";
import { SPL_ACCOUNT_COMPRESSION_PROGRAM_ID } from "@solana/spl-account-compression";
import { ASSOCIATED_TOKEN_PROGRAM_ID, getAssociatedTokenAddressSync, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import { ClaimApprovalV0 } from "..";
import { BUBBLEGUM_PROGRAM_ID, NOOP_PROGRAM_ID } from "./initializeWelcomePack";

export type RewardSplit = IdlTypes<WelcomePack>["miniFanoutShareArgV0"];

export async function claimWelcomePack({
  program,
  tuktukProgram,
  assetEndpoint,
  welcomePack,
  claimApproval,
  claimApprovalSignature,
  claimer,
  taskQueue,
  // @ts-ignore
  payer = program.provider.wallet.publicKey,
  ...rest
}: {
  welcomePack: PublicKey;
  claimer: PublicKey;
  tuktukProgram: Program<Tuktuk>;
  claimApproval: ClaimApprovalV0;
  claimApprovalSignature: Buffer;
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
  const [lazyDistributorAcc, taskQueueAcc] = await Promise.all([
    program.account.lazyDistributorV0.fetch(welcomePackAcc.lazyDistributor),
    tuktukProgram.account.taskQueueV0.fetch(taskQueue)
  ])
  const [nextPreTaskId, nextTaskId] = nextAvailableTaskIds(taskQueueAcc.taskBitmap, 2)
  const queueAuthority = queueAuthorityKey()[0]
  return program.methods
    .claimWelcomePackV0({
      ...args,
      approvalExpirationTimestamp: claimApproval.expirationTimestamp,
      claimSignature: claimApprovalSignature.toJSON().data,
      taskId: nextTaskId,
      preTaskId: nextPreTaskId,
    })
    .accountsStrict({
      merkleTree: accounts.merkleTree,
      welcomePack,
      assetReturnAddress: welcomePackAcc.assetReturnAddress.equals(PublicKey.default) ? claimer : welcomePackAcc.assetReturnAddress,
      recipient: recipientKey(welcomePackAcc.lazyDistributor, assetId)[0],
      rewardsRecipient: welcomePackAcc.rewardsSplit.length > 1 ? miniFanout : welcomePackAcc.rewardsSplit[0].wallet.equals(PublicKey.default) ? claimer : welcomePackAcc.rewardsSplit[0].wallet,
      tokenAccount: getAssociatedTokenAddressSync(lazyDistributorAcc.rewardsMint, miniFanout, true),
      queueAuthority,
      taskQueue,
      rewardsMint: lazyDistributorAcc.rewardsMint,
      owner: welcomePackAcc.owner,
      rentRefund: welcomePackAcc.rentRefund.equals(PublicKey.default) ? claimer : welcomePackAcc.rentRefund,
      claimer,
      lazyDistributorProgram: PROGRAM_ID,
      treeAuthority: PublicKey.findProgramAddressSync([accounts.merkleTree.toBuffer()], BUBBLEGUM_PROGRAM_ID)[0],
      logWrapper: NOOP_PROGRAM_ID,
      compressionProgram: SPL_ACCOUNT_COMPRESSION_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
      miniFanoutProgram: MINI_FANOUT_PROGRAM_ID,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      tokenProgram: TOKEN_PROGRAM_ID,
      bubblegumProgram: BUBBLEGUM_PROGRAM_ID,
      task: taskKey(taskQueue, nextTaskId)[0],
      preTask: taskKey(taskQueue, nextPreTaskId)[0],
      taskQueueAuthority: taskQueueAuthorityKey(
        taskQueue,
        queueAuthority
      )[0],
      tuktukProgram: tuktukProgram.programId,
    })
    .remainingAccounts(remainingAccounts);
}
