import { Program } from "@coral-xyz/anchor";
import {
  PROGRAM_ID,
  delegatedPositionKey,
  init,
} from "@helium/helium-sub-daos-sdk";
import { Status, batchSequentialParallelInstructions } from "@helium/spl-utils";
import { PublicKey, TransactionInstruction } from "@solana/web3.js";
import { useAsyncCallback } from "react-async-hook";
import { MAX_TRANSACTIONS_PER_SIGNATURE_BATCH } from "../constants";
import { useHeliumVsrState } from "../contexts/heliumVsrContext";
import { PositionWithMeta } from "../sdk/types";
import { formPositionClaims } from "../utils/formPositionClaims";
import { fetchBackwardsCompatibleIdl } from "@helium/spl-utils";

export const useUndelegatePosition = () => {
  const { provider, unixNow } = useHeliumVsrState();
  const { error, loading, execute } = useAsyncCallback(
    async ({
      position,
      programId = PROGRAM_ID,
      onInstructions,
      onProgress,
      maxSignatureBatch = MAX_TRANSACTIONS_PER_SIGNATURE_BATCH,
    }: {
      position: PositionWithMeta;
      programId?: PublicKey;
      // Instead of sending the transaction, let the caller decide
      onInstructions?: (
        instructions: TransactionInstruction[]
      ) => Promise<void>;
      onProgress?: (status: Status) => void;
      maxSignatureBatch?: number;
    }) => {
      const isInvalid = !unixNow || !provider || !position.isDelegated;
      const idl = await fetchBackwardsCompatibleIdl(programId, provider as any);
      const hsdProgram = await init(provider as any, programId, idl);

      if (loading) return;

      if (isInvalid || !hsdProgram) {
        throw new Error("Unable to Undelegate Position, Invalid params");
      } else {
        const instructions: TransactionInstruction[][] = [];
        const delegatedPosKey = delegatedPositionKey(position.pubkey)[0];
        const delegatedPosAcc =
          await hsdProgram.account.delegatedPositionV0.fetch(delegatedPosKey);

        if (position.hasRewards) {
          instructions.push(
            ...(await formPositionClaims({
              provider,
              positions: [position],
              hsdProgramId: programId,
            }))
          );
        }

        instructions.push([
          await hsdProgram.methods
            .closeDelegationV0()
            .accounts({
              position: position.pubkey,
              subDao: delegatedPosAcc.subDao,
            })
            .instruction(),
        ]);

        if (onInstructions) {
          for (const ixs of instructions) {
            await onInstructions(ixs);
          }
        } else {
          await batchSequentialParallelInstructions({
            provider,
            instructions,
            onProgress,
            triesRemaining: 10,
            extraSigners: [],
            maxSignatureBatch,
          });
        }
      }
    }
  );

  return {
    error,
    loading,
    undelegatePosition: execute,
  };
};
