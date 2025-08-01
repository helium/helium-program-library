import { BN } from "@coral-xyz/anchor";
import {
  TASK_QUEUE,
  useDelegationClaimBots,
  useTaskQueue,
} from "@helium/automation-hooks";
import {
  currentEpoch,
  delegatedPositionKey,
  getLockupEffectiveEndTs,
  init,
  PROGRAM_ID,
  subDaoEpochInfoKey,
} from "@helium/helium-sub-daos-sdk";
import { delegationClaimBotKey, init as initHplCrons } from "@helium/hpl-crons-sdk";
import { batchParallelInstructionsWithPriorityFee, fetchBackwardsCompatibleIdl, HNT_MINT, sleep } from "@helium/spl-utils";
import { nextAvailableTaskIds, taskKey } from "@helium/tuktuk-sdk";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";
import {
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  TransactionInstruction,
} from "@solana/web3.js";
import { useMemo } from "react";
import { useAsyncCallback } from "react-async-hook";
import { useHeliumVsrState } from "../contexts/heliumVsrContext";
import { PositionWithMeta, SubDaoWithMeta } from "../sdk/types";
import { useDelegatedPositions } from "./useDelegatedPositions";
import { PREPAID_TX_FEES, usePositionsFees } from "./usePositionFees";
import { useProxyConfig } from "./useProxyConfig";
import { useRegistrar } from "./useRegistrar";
import { formPositionClaims } from "../utils/formPositionClaims";

const HNT_EPOCH = 20117;

export const useDelegatePosition = ({
  automationEnabled = false,
  position,
  subDao,
}: {
  automationEnabled?: boolean;
  position: PositionWithMeta;
  subDao?: SubDaoWithMeta;
}) => {
  const { delegatePositions, ...rest } = useDelegatePositions({
    automationEnabled,
    positions: useMemo(() => [position], [position]),
    subDao,
  })

  return {
    ...rest,
    delegatePosition: delegatePositions,
  }
}

export const useDelegatePositions = ({
  automationEnabled = false,
  positions,
  subDao,
}: {
  automationEnabled?: boolean;
  positions: PositionWithMeta[];
  subDao?: SubDaoWithMeta;
}) => {
  const { provider, refetch } = useHeliumVsrState();
  const delegatedPosKeys = useMemo(
    () => positions.map((position) => delegatedPositionKey(position.pubkey)[0]),
    [positions]
  );
  const delegationClaimBotKeys = useMemo(
    () => positions.map((position) => delegationClaimBotKey(TASK_QUEUE, delegatedPositionKey(position.pubkey)[0])[0]),
    [positions]
  );
  const { accounts: delegationClaimBots } =
    useDelegationClaimBots(delegationClaimBotKeys);
  const { accounts: delegatedPositions } = useDelegatedPositions(delegatedPosKeys);
  const { info: taskQueue } = useTaskQueue(TASK_QUEUE);
  const { info: registrar } = useRegistrar(positions[0] && positions[0].registrar);
  const { info: proxyConfig } = useProxyConfig(registrar?.proxyConfig);

  const { rentFee, prepaidTxFees, insufficientBalance } = usePositionsFees({
    automationEnabled,
    numPositions: positions.length,
    numDelegatedPositions: useMemo(() => positions.filter((position) => position.isDelegated).length, [positions]),
    numDelegationClaimBots: useMemo(() => delegationClaimBots?.filter(i => i.info)?.length, [delegationClaimBots]),
    wallet: provider?.wallet?.publicKey,
  });

  const { error, loading, execute } = useAsyncCallback(
    async ({
      programId = PROGRAM_ID,
      onInstructions,
    }: {
      programId?: PublicKey;
      // Instead of sending the transaction, let the caller decide
      onInstructions?: (
        instructions: TransactionInstruction[][]
      ) => Promise<void>;
    }) => {
      const isInvalid =
        !provider || !provider.wallet || !subDao || !delegatedPositions || !delegationClaimBots;
      const idl = await fetchBackwardsCompatibleIdl(programId, provider as any);
      const hsdProgram = await init(provider as any, programId, idl);
      const hplCronsProgram = await initHplCrons(provider as any);

      if (loading) return;

      if (isInvalid || !hsdProgram) {
        throw new Error("Unable to Delegate Position, Invalid params");
      } else {
        const instructions: TransactionInstruction[][] = [];

        if (subDao) {
          if (!proxyConfig) {
            throw new Error("No proxy config found");
          }
          const now = new BN(Date.now() / 1000);
          const expiredPositions = positions.map((position, index) => {
            const delegatedPositionAcc = delegatedPositions[index];
            return {
              position,
              delegatedPosition: delegatedPositionAcc,
              index,
            }
          }).filter(({ delegatedPosition }) => delegatedPosition?.info?.expirationTs?.lt(now));
          // Claim and close out expired positions.
          if (expiredPositions.length > 0) {
            const claims = await formPositionClaims({
              provider,
              positions: expiredPositions.map(({ position }) => position),
              hsdProgramId: programId,
            })
            if (onInstructions) {
              await onInstructions(claims);
            } else {
              await batchParallelInstructionsWithPriorityFee(
                provider,
                claims,
              )
            }
            // Close out the expired positions.
            const closeInstructions = await Promise.all(expiredPositions.map(({ position }, index) => {
              return hsdProgram.methods
                .closeDelegationV0()
                .accountsPartial({
                  position: position.pubkey,
                  subDao: delegatedPositions[index].info?.subDao,
                })
                .instruction()
            }));
            if (onInstructions) {
              await onInstructions(closeInstructions.map(i => [i]));
            } else {
              await batchParallelInstructionsWithPriorityFee(
                provider,
                closeInstructions,
              )
            }

            // Remove the delegated positions from the list.
            for (const { index } of expiredPositions) {
              delegatedPositions[index].account = undefined;
              delegationClaimBots[index].info = undefined;
              positions[index].isDelegated = false;
            }
          }

          for (const [index, position] of positions.entries()) {
            const innerInstructions: TransactionInstruction[] = [];
            const delegatedPosKey = delegatedPositionKey(position.pubkey)[0];
            const delegatedPositionAcc = delegatedPositions[index];

            if (
              position.isDelegated &&
              delegatedPositionAcc &&
              !delegatedPositionAcc.info!.subDao.equals(subDao.pubkey)
            ) {
              const newExpirationTs = Math.min(
                [...proxyConfig.seasons].reverse().find(
                  (season) => now.gte(season.start)
                )?.end.toNumber() ?? 0,
                getLockupEffectiveEndTs(position.lockup).toNumber()
              );
              if (!newExpirationTs) {
                throw new Error("No new valid expiration ts found");
              }
              const oldExpirationTs = delegatedPositionAcc!.info!.expirationTs;
              const oldSubDaoEpochInfo = subDaoEpochInfoKey(
                delegatedPositionAcc!.info!.subDao,
                now
              )[0];
              const newSubDaoEpochInfo = subDaoEpochInfoKey(
                subDao.pubkey,
                now
              )[0];
              const oldGenesisEndSubDaoEpochInfo = subDaoEpochInfoKey(
                delegatedPositionAcc!.info!.subDao,
                position.genesisEnd.lt(now) ?
                  oldExpirationTs : position.genesisEnd
              )[0];
              const newGenesisEndSubDaoEpochInfo = subDaoEpochInfoKey(
                subDao.pubkey,
                position.genesisEnd.lt(now) ?
                  newExpirationTs : position.genesisEnd
              )[0];
              const closingTimeSubDaoEpochInfo = subDaoEpochInfoKey(
                subDao.pubkey,
                newExpirationTs
              )[0];
              if (delegatedPositionAcc.info && delegatedPositionAcc.info.lastClaimedEpoch.toNumber() < HNT_EPOCH) {
                throw new Error("Must claim IOT/MOBILE delegation rewards before changing delegation")
              }
              innerInstructions.push(
                await hsdProgram.methods
                  .changeDelegationV0()
                  .accountsPartial({
                    position: position.pubkey,
                    subDao: subDao.pubkey,
                    oldSubDao: delegatedPositionAcc.info!.subDao,
                    oldSubDaoEpochInfo,
                    oldGenesisEndSubDaoEpochInfo,
                    subDaoEpochInfo: newSubDaoEpochInfo,
                    closingTimeSubDaoEpochInfo,
                    genesisEndSubDaoEpochInfo: newGenesisEndSubDaoEpochInfo,
                  })
                  .instruction()
              );
            } else if (!position.isDelegated) {
              innerInstructions.push(
                await hsdProgram.methods
                  .delegateV0()
                  .accountsPartial({
                    position: position.pubkey,
                    subDao: subDao.pubkey,
                  })
                  .instruction()
              );
            } else if (position.isDelegated && position.isDelegationRenewable) {
              const now = new BN(Date.now() / 1000);
              const newExpirationTs = Math.min(
                [...proxyConfig.seasons].reverse().find(
                  (season) => now.gte(season.start)
                )?.end.toNumber() ?? 0,
                getLockupEffectiveEndTs(position.lockup).toNumber()
              );
              if (!newExpirationTs) {
                throw new Error("No new valid expiration ts found");
              }
              const oldExpirationTs = delegatedPositionAcc!.info!.expirationTs;

              const oldSubDaoEpochInfo = subDaoEpochInfoKey(
                delegatedPositionAcc!.info!.subDao,
                oldExpirationTs
              )[0];
              const newSubDaoEpochInfo = subDaoEpochInfoKey(
                delegatedPositionAcc!.info!.subDao,
                newExpirationTs
              )[0];
              const oldGenesisEndSubDaoEpochInfo = subDaoEpochInfoKey(
                delegatedPositionAcc!.info!.subDao,
                position.genesisEnd.lt(now) ?
                  newExpirationTs : position.genesisEnd
              )[0];
              innerInstructions.push(
                await hsdProgram.methods
                  .extendExpirationTsV0()
                  .accountsPartial({
                    position: position.pubkey,
                    subDao: delegatedPositionAcc!.info!.subDao,
                    oldClosingTimeSubDaoEpochInfo: oldSubDaoEpochInfo,
                    closingTimeSubDaoEpochInfo: newSubDaoEpochInfo,
                    genesisEndSubDaoEpochInfo: oldGenesisEndSubDaoEpochInfo,
                  })
                  .instruction()
              );
            }

            const delegationClaimBot = delegationClaimBots[index];
            const delegationClaimBotK = delegationClaimBots[index].publicKey;
            if (automationEnabled && (!delegationClaimBot || !delegationClaimBot.info)) {
              innerInstructions.push(
                await hplCronsProgram.methods
                  .initDelegationClaimBotV0()
                  .accountsPartial({
                    delegatedPosition: delegatedPosKey,
                    position: position.pubkey,
                    taskQueue: TASK_QUEUE,
                    mint: position.mint,
                    positionTokenAccount: getAssociatedTokenAddressSync(
                      position.mint,
                      provider.wallet.publicKey,
                      true
                    ),
                  })
                  .instruction()
              );
              innerInstructions.push(
                SystemProgram.transfer({
                  fromPubkey: provider.wallet.publicKey,
                  toPubkey: delegationClaimBotK,
                  lamports: BigInt(PREPAID_TX_FEES * LAMPORTS_PER_SOL),
                })
              );
            } else if (!automationEnabled && delegationClaimBot && delegationClaimBot.info) {
              innerInstructions.push(
                await hplCronsProgram.methods
                  .closeDelegationClaimBotV0()
                  .accountsPartial({
                    delegationClaimBot: delegationClaimBotK,
                    taskQueue: TASK_QUEUE,
                    position: position.pubkey,
                    delegatedPosition: delegatedPosKey,
                    positionTokenAccount: getAssociatedTokenAddressSync(
                      position.mint,
                      provider.wallet.publicKey,
                      true
                    ),
                  })
                  .instruction(),
              );
            }

            if (
              automationEnabled &&
              subDao
            ) {
              const nextAvailable = await nextAvailableTaskIds(
                taskQueue!.taskBitmap,
                1
              )[0];
              const task = taskKey(TASK_QUEUE, nextAvailable)[0]
              if (delegatedPositionAcc.info && delegatedPositionAcc.info.lastClaimedEpoch.toNumber() < HNT_EPOCH) {
                throw new Error("Must claim IOT/MOBILE delegation rewards before automating rewards claims")
              }
              innerInstructions.push(
                await hplCronsProgram.methods
                  .startDelegationClaimBotV1({
                    taskId: nextAvailable,
                  })
                  .accountsPartial({
                    delegationClaimBot: delegationClaimBotK,
                    subDao: subDao.pubkey,
                    mint: position.mint,
                    hntMint: HNT_MINT,
                    positionAuthority: provider.wallet!.publicKey!,
                    positionTokenAccount: getAssociatedTokenAddressSync(
                      position.mint,
                      provider.wallet.publicKey,
                      true
                    ),
                    taskQueue: TASK_QUEUE,
                    delegatedPosition: delegatedPosKey,
                    systemProgram: SystemProgram.programId,
                    delegatorAta: getAssociatedTokenAddressSync(
                      HNT_MINT,
                      provider.wallet.publicKey
                    ),
                    task,
                    nextTask: !delegationClaimBot.info || delegationClaimBot.info.nextTask.equals(PublicKey.default) ? task : delegationClaimBot.info?.nextTask,
                    rentRefund: delegationClaimBot.info?.rentRefund || provider.wallet.publicKey,
                  })
                  .instruction()
              );
            }
            instructions.push(innerInstructions);
          }
        }

        if (onInstructions) {
          await onInstructions(instructions);
        } else {
          await batchParallelInstructionsWithPriorityFee(
            provider,
            instructions,
            {
              onProgress: () => { },
              triesRemaining: 10,
              extraSigners: [],
              maxSignatureBatch: 10,
            }
          );
        }
        await sleep(2000)
        refetch();
      }
    }
  );

  return {
    error,
    loading,
    rentFee,
    prepaidTxFees,
    insufficientBalance,
    delegatePositions: execute,
  };
};
