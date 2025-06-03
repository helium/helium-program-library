import { getAssociatedTokenAddressSync } from "@solana/spl-token";
import {
  PROGRAM_ID,
  delegatedPositionKey,
  init,
  subDaoEpochInfoKey,
} from "@helium/helium-sub-daos-sdk";
import { HNT_MINT, sendInstructions } from "@helium/spl-utils";
import { init as initHplCrons } from "@helium/hpl-crons-sdk";
import {
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  TransactionInstruction,
} from "@solana/web3.js";
import { useAsyncCallback } from "react-async-hook";
import { useHeliumVsrState } from "../contexts/heliumVsrContext";
import { PositionWithMeta, SubDaoWithMeta } from "../sdk/types";
import { fetchBackwardsCompatibleIdl } from "@helium/spl-utils";
import { useMemo } from "react";
import { delegationClaimBotKey } from "@helium/hpl-crons-sdk";
import {
  TASK_QUEUE,
  useDelegationClaimBot,
  useTaskQueue,
} from "@helium/automation-hooks";
import { useDelegatedPosition } from "./useDelegatedPosition";
import { nextAvailableTaskIds, taskKey } from "@helium/tuktuk-sdk";
import { PREPAID_TX_FEES, usePositionFees } from "./usePositionFees";
import { useRegistrar } from "./useRegistrar";
import { useProxyConfig } from "./useProxyConfig";
import { BN } from "@coral-xyz/anchor";

export const useDelegatePosition = ({
  automationEnabled = false,
  position,
  subDao,
}: {
  automationEnabled?: boolean;
  position: PositionWithMeta;
  subDao?: SubDaoWithMeta;
}) => {
  const { provider } = useHeliumVsrState();
  const delegatedPosKey = useMemo(
    () => delegatedPositionKey(position.pubkey)[0],
    [position.pubkey]
  );
  const delegationClaimBotK = useMemo(
    () => delegationClaimBotKey(TASK_QUEUE, delegatedPosKey)[0]
  );
  const { info: delegationClaimBot } =
    useDelegationClaimBot(delegationClaimBotK);
  const { info: delegatedPositionAcc } = useDelegatedPosition(delegatedPosKey);
  const { info: taskQueue } = useTaskQueue(TASK_QUEUE);
  const { info: registrar } = useRegistrar(position.registrar);
  const { info: proxyConfig } = useProxyConfig(registrar?.proxyConfig);

  const { rentFee, prepaidTxFees, insufficientBalance } = usePositionFees({
    automationEnabled,
    isDelegated: position.isDelegated,
    hasDelegationClaimBot: !!delegationClaimBot,
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
        instructions: TransactionInstruction[]
      ) => Promise<void>;
    }) => {
      const isInvalid =
        !provider || !provider.wallet || (!position.isDelegated && !subDao);
      const idl = await fetchBackwardsCompatibleIdl(programId, provider as any);
      const hsdProgram = await init(provider as any, programId, idl);
      const hplCronsProgram = await initHplCrons(provider as any);

      if (loading) return;

      if (isInvalid || !hsdProgram) {
        throw new Error("Unable to Delegate Position, Invalid params");
      } else {
        const instructions: TransactionInstruction[] = [];

        if (subDao) {
          if (
            position.isDelegated &&
            delegatedPositionAcc &&
            !delegatedPositionAcc.subDao.equals(subDao.pubkey)
          ) {
            instructions.push(
              await hsdProgram.methods
                .changeDelegationV0()
                .accountsPartial({
                  position: position.pubkey,
                  subDao: subDao.pubkey,
                  oldSubDao: delegatedPositionAcc.subDao,
                })
                .instruction()
            );
          } else if (!position.isDelegated) {
            instructions.push(
              await hsdProgram.methods
                .delegateV0()
                .accountsPartial({
                  position: position.pubkey,
                  subDao: subDao.pubkey,
                })
                .instruction()
            );
          } else if (position.isDelegated && position.isDelegationRenewable) {
            const delegatedPosKey = delegatedPositionKey(position.pubkey)[0];
            const delegatedPosAcc =
              await hsdProgram.account.delegatedPositionV0.fetch(delegatedPosKey);
            const now = new BN(Date.now() / 1000);
            const newExpirationTs = proxyConfig?.seasons.reverse().find(
              (season) => now.gte(season.start)
            )?.end;
            if (!newExpirationTs) {
              throw new Error("No new valid expiration ts found");
            }
            const oldExpirationTs = delegatedPosAcc.expirationTs;

            const oldSubDaoEpochInfo = subDaoEpochInfoKey(
              delegatedPosAcc.subDao,
              oldExpirationTs
            )[0];
            const newSubDaoEpochInfo = subDaoEpochInfoKey(
              delegatedPosAcc.subDao,
              newExpirationTs
            )[0];
            instructions.push(
              await hsdProgram.methods
                .extendExpirationTsV0()
                .accountsPartial({
                  position: position.pubkey,
                  subDao: delegatedPosAcc.subDao,
                  oldClosingTimeSubDaoEpochInfo: oldSubDaoEpochInfo,
                  closingTimeSubDaoEpochInfo: newSubDaoEpochInfo,
                })
                .instruction()
            );
          }
        }

        if (automationEnabled && !delegationClaimBot) {
          instructions.push(
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
          instructions.push(
            SystemProgram.transfer({
              fromPubkey: provider.wallet.publicKey,
              toPubkey: delegationClaimBotK,
              lamports: BigInt(PREPAID_TX_FEES * LAMPORTS_PER_SOL),
            })
          );
        }

        if (
          automationEnabled &&
          (!delegationClaimBot || !delegationClaimBot.queued) &&
          subDao
        ) {
          const nextAvailable = await nextAvailableTaskIds(
            taskQueue!.taskBitmap,
            1
          )[0];
          instructions.push(
            await hplCronsProgram.methods
              .startDelegationClaimBotV0({
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
                task: taskKey(TASK_QUEUE, nextAvailable)[0],
              })
              .instruction()
          );
        }

        if (onInstructions) {
          await onInstructions(instructions);
        } else {
          await sendInstructions(provider, instructions);
        }
      }
    }
  );

  return {
    error,
    loading,
    rentFee,
    prepaidTxFees,
    insufficientBalance,
    delegatePosition: execute,
  };
};
