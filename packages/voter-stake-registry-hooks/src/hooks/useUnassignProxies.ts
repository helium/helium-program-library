import { Program } from "@coral-xyz/anchor";
import { PROGRAM_ID, proxyAssignmentKey, init } from "@helium/nft-proxy-sdk";
import {
  truthy,
  batchParallelInstructions,
  Status,
  batchParallelInstructionsWithPriorityFee,
} from "@helium/spl-utils";
import { PublicKey, TransactionInstruction } from "@solana/web3.js";
import { useAsyncCallback } from "react-async-hook";
import { useHeliumVsrState } from "../contexts/heliumVsrContext";
import { PositionWithMeta } from "../sdk/types";
import { MAX_TRANSACTIONS_PER_SIGNATURE_BATCH } from "../constants";

export const useUnassignProxies = () => {
  const { provider, registrar, voteService, refetch } = useHeliumVsrState();
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
      onInstructions?: (
        instructions: TransactionInstruction[]
      ) => Promise<void>;
      onProgress?: (status: Status) => void;
      maxSignatureBatch?: number;
    }) => {
      const isInvalid = !provider;

      const idl = await Program.fetchIdl(programId, provider);
      const nftProxyProgram = await init(provider as any, programId, idl);

      if (loading) return;

      if (isInvalid || !nftProxyProgram || !registrar || !voteService) {
        throw new Error("Unable to unassign proxy, Invalid params");
      } else {
        const instructions: TransactionInstruction[] = [];
        for (const position of positions) {
          let currentProxyAssignment = proxyAssignmentKey(
            registrar.proxyConfig,
            position.mint,
            provider.wallet.publicKey
          )[0];
          let proxy = await nftProxyProgram.account.proxyAssignmentV0.fetchNullable(
            currentProxyAssignment
          );
          if (!proxy) {
            currentProxyAssignment = proxyAssignmentKey(
              registrar.proxyConfig,
              position.mint,
              PublicKey.default
            )[0];
            proxy = await nftProxyProgram.account.proxyAssignmentV0.fetch(
              currentProxyAssignment
            );
          }
          const toUndelegate = await voteService.getProxyAssignmentsForPosition(
            position.pubkey,
            proxy.index
          );

          instructions.push(
            ...(
              await Promise.all(
                toUndelegate.map((proxy, index) => {
                  // Can't undelegate the 1st one (Pubkey.default)
                  if (index == toUndelegate.length - 1) {
                    return Promise.resolve(undefined);
                  }

                  const prevProxyAssignment = new PublicKey(
                    toUndelegate[index + 1].address
                  );
                  return nftProxyProgram.methods
                    .unassignProxyV0()
                    .accounts({
                      asset: position.mint,
                      prevProxyAssignment,
                      currentProxyAssignment,
                      proxyAssignment: new PublicKey(proxy.address),
                    })
                    .instruction();
                })
              )
            ).filter(truthy)
          );
        }

        if (onInstructions) {
          await onInstructions(instructions);
        } else {
          await batchParallelInstructionsWithPriorityFee(
            provider,
            instructions,
            {
              onProgress,
              triesRemaining: 10,
              extraSigners: [],
              maxSignatureBatch,
            }
          );
        }
        // Wait a couple seconds for changes to hit pg-sink
        setTimeout(refetch, 2 * 1000);
      }
    }
  );

  return {
    error,
    loading,
    unassignProxies: execute,
  };
};
