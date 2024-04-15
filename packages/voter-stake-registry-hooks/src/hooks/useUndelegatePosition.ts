import { BN, Program } from "@coral-xyz/anchor";
import {
  EPOCH_LENGTH,
  PROGRAM_ID,
  delegatedPositionKey,
  init,
} from "@helium/helium-sub-daos-sdk";
import { Status, batchParallelInstructionsWithPriorityFee, sendInstructions } from "@helium/spl-utils";
import { PublicKey, TransactionInstruction } from "@solana/web3.js";
import { useAsyncCallback } from "react-async-hook";
import { useHeliumVsrState } from "../contexts/heliumVsrContext";
import { PositionWithMeta } from "../sdk/types";
import { isClaimed } from "@helium/voter-stake-registry-sdk";

export const useUndelegatePosition = () => {
  const { provider, unixNow } = useHeliumVsrState();
  const { error, loading, execute } = useAsyncCallback(
    async ({
      position,
      programId = PROGRAM_ID,
      onInstructions,
      onProgress,
    }: {
      position: PositionWithMeta;
      programId?: PublicKey;
      // Instead of sending the transaction, let the caller decide
      onInstructions?: (
        instructions: TransactionInstruction[]
      ) => Promise<void>;
      onProgress?: (status: Status) => void;
    }) => {
      const isInvalid = !unixNow || !provider || !position.isDelegated;
      const idl = await Program.fetchIdl(programId, provider);
      const hsdProgram = await init(provider as any, programId, idl);

      if (loading) return;

      if (isInvalid || !hsdProgram) {
        throw new Error("Unable to Undelegate Position, Invalid params");
      } else {
        const delegatedPosKey = delegatedPositionKey(position.pubkey)[0];
        const delegatedPosAcc =
          await hsdProgram.account.delegatedPositionV0.fetch(delegatedPosKey);
        const currentEpoch = new BN(unixNow).div(new BN(EPOCH_LENGTH));

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

        instructions.push(
          await hsdProgram.methods
            .closeDelegationV0()
            .accounts({
              position: position.pubkey,
              subDao: delegatedPosAcc.subDao,
            })
            .instruction()
        );

        if (onInstructions) {
          await onInstructions(instructions);
        } else {
          const claims = instructions.slice(0, instructions.length - 1);
          const close = instructions[instructions.length - 1];
          if (claims.length > 0) {
            await batchParallelInstructionsWithPriorityFee(provider, claims, {
              onProgress,
            });
          }
          await sendInstructions(provider, [close]);
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
