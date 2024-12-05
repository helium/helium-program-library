import { PROGRAM_ID } from "@helium/helium-sub-daos-sdk";
import { PROGRAM_ID as PVR_PROGRAM_ID } from "@helium/position-voting-rewards-sdk";
import { Status, batchSequentialParallelInstructions } from "@helium/spl-utils";
import { PublicKey, TransactionInstruction } from "@solana/web3.js";
import { useAsyncCallback } from "react-async-hook";
import { MAX_TRANSACTIONS_PER_SIGNATURE_BATCH } from "../constants";
import { useHeliumVsrState } from "../contexts/heliumVsrContext";
import { PositionWithMeta } from "../sdk/types";
import { formPositionClaims } from "../utils/formPositionClaims";

export const useClaimPositionRewards = () => {
  const { provider, unixNow } = useHeliumVsrState();
  const { error, loading, execute } = useAsyncCallback(
    async ({
      position,
      programId = PROGRAM_ID,
      onProgress,
      onInstructions,
      maxSignatureBatch = MAX_TRANSACTIONS_PER_SIGNATURE_BATCH,
    }: {
      position: PositionWithMeta;
      programId?: PublicKey;
      onProgress?: (status: Status) => void;
      // Instead of sending the transaction, let the caller decide
      onInstructions?: (
        instructions: TransactionInstruction[]
      ) => Promise<void>;
      maxSignatureBatch?: number;
    }) => {
      const isInvalid = !provider;
      if (loading) return;

      if (isInvalid) {
        throw new Error("Unable to Claim Rewards, Invalid params");
      } else {
        const instructions = await formPositionClaims({
          provider,
          positions: [position],
          hsdProgramId: programId,
        });

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
    claimPositionRewards: execute,
  };
};
