import { BN } from "@coral-xyz/anchor";
import { TASK_QUEUE, useTaskQueue } from "@helium/automation-hooks";
import {
  daoKey,
  delegatedPositionKey,
  getLockupEffectiveEndTs,
  init as initHsd,
  subDaoEpochInfoKey,
  subDaoKey,
} from "@helium/helium-sub-daos-sdk";
import { delegationClaimBotKey, init as initHplCrons } from "@helium/hpl-crons-sdk";
import { init as initProxy } from "@helium/nft-proxy-sdk";
import { HNT_MINT, sendInstructions } from "@helium/spl-utils";
import { nextAvailableTaskIds, taskKey } from "@helium/tuktuk-sdk";
import { init as initVsr, positionKey } from "@helium/voter-stake-registry-sdk";
import {
  MintLayout,
  TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountIdempotentInstruction,
  createInitializeMintInstruction,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import {
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SYSVAR_CLOCK_PUBKEY,
  SystemProgram,
  TransactionInstruction,
} from "@solana/web3.js";
import { useQueryClient } from "@tanstack/react-query";
import { min } from "bn.js";
import { useAsync, useAsyncCallback } from "react-async-hook";
import { INDEXER_WAIT } from "../constants";
import { useHeliumVsrState } from "../contexts/heliumVsrContext";
import { HeliumVsrClient } from "../sdk/client";
import { SubDaoWithMeta } from "../sdk/types";
import { PREPAID_TX_FEES, usePositionFees } from "./usePositionFees";

const SECS_PER_DAY = 86400;
export const useCreatePosition = ({
  automationEnabled = false,
}: {
  automationEnabled?: boolean;
}) => {
  const { provider } = useHeliumVsrState();
  const { result: client } = useAsync(
    (provider) => HeliumVsrClient.connect(provider),
    [provider]
  );
  const queryClient = useQueryClient();

  const { rentFee, prepaidTxFees, insufficientBalance } = usePositionFees({
    automationEnabled,
    isDelegated: true,
    hasDelegationClaimBot: false,
    wallet: provider?.wallet?.publicKey
  });
  const { info: taskQueue } = useTaskQueue(TASK_QUEUE);

  const { error, loading, execute } = useAsyncCallback(
    async ({
      amount,
      lockupKind = { cliff: {} },
      lockupPeriodsInDays,
      mint,
      subDao,
      onInstructions,
    }: {
      amount: BN;
      lockupKind: any;
      lockupPeriodsInDays: number;
      mint: PublicKey;
      subDao?: SubDaoWithMeta;
      // Instead of sending the transaction, let the caller decide
      onInstructions?: (
        instructions: TransactionInstruction[],
        signers: Keypair[]
      ) => Promise<void>;
    }) => {
      const isInvalid = !provider || !client;
      if (isInvalid) {
        throw new Error("Unable to Create Position, Invalid params");
      } else {
        const hsdProgram = await initHsd(provider);
        const proxyProgram = await initProxy(provider);
        const vsrProgram = await initVsr(provider);
        const hplCronsProgram = await initHplCrons(provider as any);
        const [daoK] = daoKey(mint);
        const [subDaoK] = subDaoKey(mint);
        const myDao = await hsdProgram.account.daoV0.fetchNullable(daoK);
        const mySubDao = await hsdProgram.account.subDaoV0.fetchNullable(
          subDaoK
        );
        const registrar = (mySubDao?.registrar || myDao?.registrar)!;
        const registarAcc = await vsrProgram.account.registrar.fetch(registrar);
        const proxyConfig = await proxyProgram.account.proxyConfigV0.fetch(
          registarAcc.proxyConfig
        );
        const mintKeypair = Keypair.generate();
        const position = positionKey(mintKeypair.publicKey)[0];
        const instructions: TransactionInstruction[] = [];
        const delegateInstructions: TransactionInstruction[] = [];
        const mintRent =
          await provider.connection.getMinimumBalanceForRentExemption(
            MintLayout.span
          );

        instructions.push(
          SystemProgram.createAccount({
            fromPubkey: provider.wallet!.publicKey!,
            newAccountPubkey: mintKeypair.publicKey,
            lamports: mintRent,
            space: MintLayout.span,
            programId: TOKEN_PROGRAM_ID,
          })
        );

        instructions.push(
          createInitializeMintInstruction(
            mintKeypair.publicKey,
            0,
            position,
            position
          )
        );

        instructions.push(
          await client.program.methods
            .initializePositionV0({
              kind: { [lockupKind]: {} },
              periods: lockupPeriodsInDays,
            } as any)
            .accountsPartial({
              registrar,
              mint: mintKeypair.publicKey,
              depositMint: mint,
              recipient: provider.wallet!.publicKey!,
            })
            .instruction()
        );

        instructions.push(
          await client.program.methods
            .depositV0({
              amount,
            })
            .accountsPartial({
              registrar,
              position,
              mint,
            })
            .instruction()
        );

        if (subDao) {
          const clock = await provider.connection.getAccountInfo(
            SYSVAR_CLOCK_PUBKEY
          );
          const unixTime = clock!.data.readBigInt64LE(8 * 4);
          const registrarAcc = await client.program.account.registrar.fetch(
            registrar
          );
          const currTs = Number(unixTime) + registrarAcc.timeOffset.toNumber();
          const endTs = new BN(currTs + lockupPeriodsInDays * SECS_PER_DAY);
          const expirationTs =
            [...(proxyConfig.seasons || [])]
              .reverse()
              .find((season) => new BN(currTs).gte(season.start))?.end || endTs;

          const [subDaoEpochInfo] = subDaoEpochInfoKey(subDao.pubkey, currTs);
          const [endSubDaoEpochInfoKey] = subDaoEpochInfoKey(
            subDao.pubkey,
            min(
              getLockupEffectiveEndTs({
                kind: { [lockupKind]: {} },
                endTs,
              }),
              expirationTs
            )
          );

          delegateInstructions.push(
            await hsdProgram.methods
              .delegateV0()
              .accountsPartial({
                position,
                mint: mintKeypair.publicKey,
                registrar,
                subDao: subDao.pubkey,
                dao: subDao.dao,
                subDaoEpochInfo: subDaoEpochInfo,
                closingTimeSubDaoEpochInfo: endSubDaoEpochInfoKey,
                genesisEndSubDaoEpochInfo: endSubDaoEpochInfoKey,
              })
              .instruction()
          );

          if (automationEnabled) {
            const delegatedPosKey = delegatedPositionKey(position)[0];
            delegateInstructions.push(
              createAssociatedTokenAccountIdempotentInstruction(
                provider.wallet.publicKey,
                getAssociatedTokenAddressSync(HNT_MINT, provider.wallet.publicKey, true),
                provider.wallet.publicKey,
                HNT_MINT,
              )
            )
            delegateInstructions.push(
              await hplCronsProgram.methods
                .initDelegationClaimBotV0()
                .accountsPartial({
                  delegatedPosition: delegatedPosKey,
                  position: position,
                  taskQueue: TASK_QUEUE,
                  mint: mintKeypair.publicKey,
                  positionTokenAccount: getAssociatedTokenAddressSync(mintKeypair.publicKey, provider.wallet.publicKey, true),
                })
                .instruction()
            );
            const delegationClaimBotK = delegationClaimBotKey(TASK_QUEUE, delegatedPosKey)[0];
            delegateInstructions.push(
              SystemProgram.transfer({
                fromPubkey: provider.wallet.publicKey,
                toPubkey: delegationClaimBotK,
                lamports: BigInt(
                  PREPAID_TX_FEES * LAMPORTS_PER_SOL
                ),
              })
            );
            const nextAvailable = await nextAvailableTaskIds(taskQueue!.taskBitmap, 1)[0];
            const task = taskKey(TASK_QUEUE, nextAvailable)[0];
            delegateInstructions.push(
              await hplCronsProgram.methods
                .startDelegationClaimBotV1({
                  taskId: nextAvailable,
                })
                .accountsPartial({
                  delegationClaimBot: delegationClaimBotK,
                  subDao: subDao.pubkey,
                  mint: mintKeypair.publicKey,
                  hntMint: HNT_MINT,
                  positionAuthority: provider.wallet!.publicKey!,
                  positionTokenAccount: getAssociatedTokenAddressSync(mintKeypair.publicKey, provider.wallet.publicKey, true),
                  taskQueue: TASK_QUEUE,
                  delegatedPosition: delegatedPosKey,
                  systemProgram: SystemProgram.programId,
                  delegatorAta: getAssociatedTokenAddressSync(
                    HNT_MINT,
                    provider.wallet.publicKey
                  ),
                  task,
                  nextTask: task,
                  rentRefund: provider.wallet.publicKey,
                })
                .instruction()
            );
          }
        }

        if (onInstructions) {
          await onInstructions(
            [...instructions, ...delegateInstructions],
            [mintKeypair]
          );
        } else {
          await sendInstructions(provider, instructions, [mintKeypair]);
          if (delegateInstructions.length > 0) {
            await sendInstructions(provider, delegateInstructions);
          }
        }

        // Give some time for indexers
        setTimeout(async () => {
          try {
            await queryClient.invalidateQueries({
              queryKey: ["positionKeys"],
            });
          } catch (e: any) {
            console.error("Exception invalidating queries", e);
          }
        }, INDEXER_WAIT);
      }
    }
  );

  return {
    error,
    loading,
    rentFee,
    prepaidTxFees,
    insufficientBalance,
    createPosition: execute,
  };
};
