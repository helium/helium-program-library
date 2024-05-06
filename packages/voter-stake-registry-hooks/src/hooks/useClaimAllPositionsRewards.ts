import { BN, Program } from "@coral-xyz/anchor";
import {
  EPOCH_LENGTH,
  PROGRAM_ID,
  daoKey,
  delegatedPositionKey,
  init,
  subDaoEpochInfoKey,
} from "@helium/helium-sub-daos-sdk";
import {
  PROGRAM_ID as CIRCUIT_BREAKER_PROGRAM_ID,
  accountWindowedBreakerKey,
} from "@helium/circuit-breaker-sdk";
import {
  batchParallelInstructions,
  chunks,
  HNT_MINT,
  Status,
} from "@helium/spl-utils";
import {
  getAssociatedTokenAddressSync,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import {
  PublicKey,
  SystemProgram,
  TransactionInstruction,
} from "@solana/web3.js";
import { useAsyncCallback } from "react-async-hook";
import { useHeliumVsrState } from "../contexts/heliumVsrContext";
import { PositionWithMeta, SubDao } from "../sdk/types";
import { MAX_TRANSACTIONS_PER_SIGNATURE_BATCH } from "../constants";
import {
  PROGRAM_ID as VSR_PROGRAM_ID,
  isClaimed,
} from "@helium/voter-stake-registry-sdk";

const DAO = daoKey(HNT_MINT)[0];
export const useClaimAllPositionsRewards = () => {
  const { provider, unixNow } = useHeliumVsrState();
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
        const bucketedEpochsByPosition: Record<
          string,
          TransactionInstruction[][]
        > = {};
        const delegatedPositions = await Promise.all(
          positions.map(async (p) => {
            const key = delegatedPositionKey(p.pubkey)[0];
            return {
              key,
              account: await hsdProgram.account.delegatedPositionV0.fetch(key),
            };
          })
        );
        const subDaoKeys = new Set([
          ...delegatedPositions.map((p) => p.account.subDao.toBase58()),
        ]);
        const subDaos = (
          await Promise.all(
            [...subDaoKeys].map(async (sd) => ({
              key: sd,
              account: await hsdProgram.account.subDaoV0.fetch(sd),
            }))
          )
        ).reduce((acc, { key, account }) => {
          acc[key] = account;
          return acc;
        }, {} as Record<string, SubDao>);

        for (const [idx, position] of positions.entries()) {
          const delegatedPosition = delegatedPositions[idx];
          bucketedEpochsByPosition[position.pubkey.toBase58()] =
            bucketedEpochsByPosition[position.pubkey.toBase58()] || [];
          const { lastClaimedEpoch, claimedEpochsBitmap } =
            delegatedPosition.account;
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
          const subDao = delegatedPosition.account.subDao;
          const subDaoStr = subDao.toBase58();
          const subDaoAcc = subDaos[subDaoStr];

          // Chunk size is 128 because we want each chunk to correspond to the 128 bits in bitmap
          for (const chunk of chunks(epochsToClaim, 128)) {
            bucketedEpochsByPosition[position.pubkey.toBase58()].push(
              await Promise.all(
                chunk.map((epoch) =>
                  hsdProgram.methods
                    .claimRewardsV0({
                      epoch,
                    })
                    .accountsStrict({
                      position: position.pubkey,
                      mint: position.mint,
                      positionTokenAccount: getAssociatedTokenAddressSync(
                        position.mint,
                        provider.wallet.publicKey
                      ),
                      positionAuthority: provider.wallet.publicKey,
                      registrar: position.registrar,
                      dao: DAO,
                      subDao: delegatedPosition.account.subDao,
                      delegatedPosition: delegatedPosition.key,
                      dntMint: subDaoAcc.dntMint,
                      subDaoEpochInfo: subDaoEpochInfoKey(
                        subDao,
                        epoch.mul(new BN(EPOCH_LENGTH))
                      )[0],
                      delegatorPool: subDaoAcc.delegatorPool,
                      delegatorAta: getAssociatedTokenAddressSync(
                        subDaoAcc.dntMint,
                        provider.wallet.publicKey
                      ),
                      delegatorPoolCircuitBreaker: accountWindowedBreakerKey(
                        subDaoAcc.delegatorPool
                      )[0],
                      vsrProgram: VSR_PROGRAM_ID,
                      systemProgram: SystemProgram.programId,
                      circuitBreakerProgram: CIRCUIT_BREAKER_PROGRAM_ID,
                      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
                      tokenProgram: TOKEN_PROGRAM_ID,
                    })
                    .instruction()
                )
              )
            );
          }
        }

        const multiDemArray = Object.entries(bucketedEpochsByPosition).reduce(
          (acc, [_, instructions]) => {
            instructions.map((ixs, idx) => {
              acc[idx] = acc[idx] || [];
              acc[idx].push(...ixs);
            });
            return acc;
          },
          [] as TransactionInstruction[][]
        );

        if (onInstructions) {
          for (const ixs of multiDemArray) {
            await onInstructions(ixs);
          }
        } else {
          await batchParallelInstructions({
            provider,
            instructions: multiDemArray.flat(),
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
