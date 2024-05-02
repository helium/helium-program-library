import { Program } from "@coral-xyz/anchor";
import { PROGRAM_ID, init } from "@helium/nft-proxy-sdk";
import {
  Status,
  batchParallelInstructions,
  batchParallelInstructionsWithPriorityFee,
} from "@helium/spl-utils";
import { PublicKey, TransactionInstruction } from "@solana/web3.js";
import BN from "bn.js";
import { useAsyncCallback } from "react-async-hook";
import { useHeliumVsrState } from "../contexts/heliumVsrContext";
import { PositionWithMeta } from "../sdk/types";

export const useAssignProxies = () => {
  const { provider, registrar, refetch } = useHeliumVsrState();
  const { error, loading, execute } = useAsyncCallback(
    async ({
      positions,
      recipient,
      programId = PROGRAM_ID,
      expirationTime,
      onInstructions,
      onProgress,
      maxSignatureBatch,
    }: {
      positions: PositionWithMeta[];
      recipient: PublicKey;
      programId?: PublicKey;
      expirationTime: BN;
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

      if (isInvalid || !nftProxyProgram || !registrar) {
        throw new Error("Unable to voting delegate, Invalid params");
      } else {
        const instructions: TransactionInstruction[] = [];
        for (const position of positions) {
          const {
            instruction,
            pubkeys: { nextProxy },
          } = await nftProxyProgram.methods
            .assignProxyV0({
              expirationTime,
            })
            .accounts({
              asset: position.mint,
              recipient,
              proxyConfig: registrar.proxyConfig,
            })
            .prepare();
          // Don't delegate where there's already a proxy.
          if (await provider.connection.getAccountInfo(nextProxy!)) {
            throw new Error(
              "Recipient wallet is already a proxy to this position"
            );
          } else {
            instructions.push(instruction);
          }
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
    assignProxies: execute,
  };
};
