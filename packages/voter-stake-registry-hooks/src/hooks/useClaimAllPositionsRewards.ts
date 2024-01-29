import { BN, Program } from "@coral-xyz/anchor";
import { useSolanaUnixNow } from "@helium/helium-react-hooks";
import {
  EPOCH_LENGTH,
  PROGRAM_ID,
  delegatedPositionKey,
  init,
} from "@helium/helium-sub-daos-sdk";
import { batchParallelInstructions, Status } from "@helium/spl-utils";
import { PublicKey, TransactionInstruction } from "@solana/web3.js";
import { useAsyncCallback } from "react-async-hook";
import { useHeliumVsrState } from "../contexts/heliumVsrContext";
import { PositionWithMeta } from "../sdk/types";
import { MAX_TRANSACTIONS_PER_SIGNATURE_BATCH } from "../constants";

export const useClaimAllPositionsRewards = () => {
  const { provider } = useHeliumVsrState();
  const unixNow = useSolanaUnixNow();
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
      const isInvalid =
        !unixNow || !provider || !positions.every((pos) => pos.hasRewards);

      const idl = await Program.fetchIdl(programId, provider);
      const hsdProgram = await init(provider as any, programId, idl);

      if (loading) return;

      if (isInvalid || !hsdProgram) {
        throw new Error("Unable to Claim All Rewards, Invalid params");
      } else {
        const currentEpoch = new BN(unixNow).div(new BN(EPOCH_LENGTH));
        const multiDemArray: TransactionInstruction[][] = [];

        for (const [idx, position] of positions.entries()) {
          multiDemArray[idx] = multiDemArray[idx] || [];
          const delegatedPosKey = delegatedPositionKey(position.pubkey)[0];
          const delegatedPosAcc =
            await hsdProgram.account.delegatedPositionV0.fetch(delegatedPosKey);

          const { lastClaimedEpoch } = delegatedPosAcc;
          const epoch = lastClaimedEpoch.add(new BN(1));
          const epochsToClaim = Array.from(
            { length: currentEpoch.sub(epoch).toNumber() },
            (_v, k) => epoch.addn(k)
          );

          multiDemArray[idx].push(
            ...(await Promise.all(
              epochsToClaim.map(
                async (epoch) =>
                  await hsdProgram.methods
                    .claimRewardsV0({
                      epoch,
                    })
                    .accounts({
                      position: position.pubkey,
                      subDao: delegatedPosAcc.subDao,
                    })
                    .instruction()
              )
            ))
          );
        }

        if (onInstructions) {
          await onInstructions(multiDemArray.flat());
        } else {
          await batchParallelInstructions(
            provider,
            multiDemArray.flat(),
            onProgress,
            10,
            [],
            maxSignatureBatch
          );
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
