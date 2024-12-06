import { PROGRAM_ID, daoKey } from "@helium/helium-sub-daos-sdk";
import {
  HNT_MINT,
  Status,
  batchSequentialParallelInstructions,
} from "@helium/spl-utils";
import { PublicKey, TransactionInstruction } from "@solana/web3.js";
import { useAsyncCallback } from "react-async-hook";
import { MAX_TRANSACTIONS_PER_SIGNATURE_BATCH } from "../constants";
import { useHeliumVsrState } from "../contexts/heliumVsrContext";
import { PositionWithMeta } from "../sdk/types";
import { formPositionClaims } from "../utils/formPositionClaims";

const DAO = daoKey(HNT_MINT)[0];

export const useClaimAllPositionsRewards = () => {
  const { provider } = useHeliumVsrState();
  const { error, loading, execute } = useAsyncCallback(
    async ({
      positions,
      programId = PROGRAM_ID,
      onProgress,
      onInstructions,
      maxSignatureBatch = MAX_TRANSACTIONS_PER_SIGNATURE_BATCH,
    }: {
      positions: PositionWithMeta[];
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
        throw new Error("Unable to Claim All Rewards, Invalid params");
      } else {
        const instructions = await formPositionClaims({
          provider,
          positions,
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
    claimAllPositionsRewards: execute,
  };
};
