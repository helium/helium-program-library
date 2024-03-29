import { BN, Program } from "@coral-xyz/anchor";
import {
  EPOCH_LENGTH,
  PROGRAM_ID,
  delegatedPositionKey,
  init,
} from "@helium/helium-sub-daos-sdk";
import { Status, batchParallelInstructions } from "@helium/spl-utils";
import { isClaimed } from "@helium/voter-stake-registry-sdk";
import { PublicKey, TransactionInstruction } from "@solana/web3.js";
import { useAsyncCallback } from "react-async-hook";
import { MAX_TRANSACTIONS_PER_SIGNATURE_BATCH } from "../constants";
import { useHeliumVsrState } from "../contexts/heliumVsrContext";
import { PositionWithMeta } from "../sdk/types";

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
      const isInvalid = !unixNow || !provider || !position.hasRewards;

      const idl = await Program.fetchIdl(programId, provider);
      const hsdProgram = await init(provider as any, programId, idl);

      if (loading) return;

      if (isInvalid || !hsdProgram) {
        throw new Error("Unable to Claim Rewards, Invalid params");
      } else {
        const currentEpoch = new BN(unixNow).div(new BN(EPOCH_LENGTH));
        const delegatedPosKey = delegatedPositionKey(position.pubkey)[0];
        const delegatedPosAcc =
          await hsdProgram.account.delegatedPositionV0.fetch(delegatedPosKey);

        const { lastClaimedEpoch, claimedEpochsBitmap } = delegatedPosAcc;
        const epoch = lastClaimedEpoch.add(new BN(1));
        const epochsToClaim = Array.from(
          { length: currentEpoch.sub(epoch).toNumber() },
          (_v, k) => epoch.addn(k)
        ).filter(
          (epoch) =>
            !isClaimed({
              epoch: epoch.toNumber(),
              lastClaimedEpoch: lastClaimedEpoch.toNumber(),
              claimedEpochsBitmap,
            })
        );

        const instructions: TransactionInstruction[] = await Promise.all(
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
        );

        if (onInstructions) {
          await onInstructions(instructions);
        } else {
          await batchParallelInstructions(
            provider,
            instructions,
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
    claimPositionRewards: execute,
  };
};
