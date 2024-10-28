import { BN, Program } from "@coral-xyz/anchor";
import {
  EPOCH_LENGTH,
  PROGRAM_ID,
  delegatedPositionKey,
  init,
} from "@helium/helium-sub-daos-sdk";
import {
  Status,
  batchSequentialParallelInstructions,
  chunks,
} from "@helium/spl-utils";
import { isClaimed } from "@helium/voter-stake-registry-sdk";
import { PublicKey, TransactionInstruction } from "@solana/web3.js";
import { useAsyncCallback } from "react-async-hook";
import { MAX_TRANSACTIONS_PER_SIGNATURE_BATCH } from "../constants";
import { useHeliumVsrState } from "../contexts/heliumVsrContext";
import { PositionWithMeta } from "../sdk/types";
import {
  init as initPvr,
  enrolledPositionKey,
  PROGRAM_ID as PVR_PROGRAM_ID,
} from "@helium/position-voting-rewards-sdk";

export const useClaimPositionRewards = () => {
  const { provider, unixNow } = useHeliumVsrState();
  const { error, loading, execute } = useAsyncCallback(
    async ({
      position,
      programId = PROGRAM_ID,
      pvrProgramId = PVR_PROGRAM_ID,
      onProgress,
      onInstructions,
      maxSignatureBatch = MAX_TRANSACTIONS_PER_SIGNATURE_BATCH,
    }: {
      position: PositionWithMeta;
      programId?: PublicKey;
      pvrProgramId?: PublicKey;
      onProgress?: (status: Status) => void;
      // Instead of sending the transaction, let the caller decide
      onInstructions?: (
        instructions: TransactionInstruction[]
      ) => Promise<void>;
      maxSignatureBatch?: number;
    }) => {
      const isInvalid = !unixNow || !provider || !position.hasRewards;

      const idl = await Program.fetchIdl(programId, provider);
      const pvrIdl = await Program.fetchIdl(pvrProgramId, provider);
      const hsdProgram = await init(provider as any, programId, idl);
      const pvrProgram = await initPvr(provider as any, pvrProgramId, pvrIdl);

      if (loading) return;

      if (isInvalid || !hsdProgram) {
        throw new Error("Unable to Claim Rewards, Invalid params");
      } else {
        const { lockup } = position;
        const lockupKind = Object.keys(lockup.kind)[0] as string;
        const isConstant = lockupKind === "constant";
        const isDecayed = !isConstant && lockup.endTs.lte(new BN(unixNow));
        const decayedEpoch = lockup.endTs.div(new BN(EPOCH_LENGTH));
        const currentEpoch = new BN(unixNow).div(new BN(EPOCH_LENGTH));
        const delegatedPosKey = delegatedPositionKey(position.pubkey)[0];
        const delegatedPosAcc =
          await hsdProgram.account.delegatedPositionV0.fetchNullable(
            delegatedPosKey
          );

        const instructions: TransactionInstruction[][] = [];

        if (delegatedPosAcc) {
          const { lastClaimedEpoch, claimedEpochsBitmap } = delegatedPosAcc;
          const epoch = lastClaimedEpoch.add(new BN(1));
          const epochsCount = isDecayed
            ? decayedEpoch.sub(epoch).add(new BN(1)).toNumber()
            : currentEpoch.sub(epoch).toNumber();

          const epochsToClaim = Array.from(
            { length: epochsCount > 0 ? epochsCount : 0 },
            (_v, k) => epoch.addn(k)
          ).filter(
            (epoch) =>
              !isClaimed({
                epoch: epoch.toNumber(),
                lastClaimedEpoch: lastClaimedEpoch.toNumber(),
                claimedEpochsBitmap,
              })
          );
          // Chunk size is 128 because we want each chunk to correspond to the 128 bits in bitmap
          for (const chunk of chunks(epochsToClaim, 128)) {
            instructions.push(
              await Promise.all(
                chunk.map(
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
              )
            );
          }
        }

        const enrolledPosKey = enrolledPositionKey(position.pubkey)[0];
        const enrolledPosAcc =
          await pvrProgram.account.enrolledPositionV0.fetchNullable(
            enrolledPosKey
          );

        if (enrolledPosAcc) {
          const { lastClaimedEpoch, claimedEpochsBitmap } = enrolledPosAcc;
          const epoch = lastClaimedEpoch.add(new BN(1));
          const epoch = lastClaimedEpoch.add(new BN(1));
          const epochsCount = isDecayed
            ? decayedEpoch.sub(epoch).add(new BN(1)).toNumber()
            : currentEpoch.sub(epoch).toNumber();

          const epochsToClaim = Array.from(
            { length: epochsCount > 0 ? epochsCount : 0 },
            (_v, k) => epoch.addn(k)
          ).filter(
            (epoch) =>
              !isClaimed({
                epoch: epoch.toNumber(),
                lastClaimedEpoch: lastClaimedEpoch.toNumber(),
                claimedEpochsBitmap,
              })
          );

          // Chunk size is 128 because we want each chunk to correspond to the 128 bits in bitmap
          for (const chunk of chunks(epochsToClaim, 128)) {
            instructions.push(
              await Promise.all(
                chunk.map(
                  async (epoch) =>
                    await pvrProgram.methods
                      .claimRewardsV0({
                        epoch,
                      })
                      .accounts({
                        position: position.pubkey,
                        enrolledPosition: enrolledPosKey,
                      })
                      .instruction()
                )
              )
            );
          }
        }

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
