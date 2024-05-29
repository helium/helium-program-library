import { Program } from "@coral-xyz/anchor";
import { PROGRAM_ID, init, proxyAssignmentKey } from "@helium/nft-proxy-sdk";
import {
  Status,
  batchParallelInstructionsWithPriorityFee,
  truthy
} from "@helium/spl-utils";
import { PublicKey, TransactionInstruction } from "@solana/web3.js";
import BN from "bn.js";
import { useAsyncCallback } from "react-async-hook";
import { useHeliumVsrState } from "../contexts/heliumVsrContext";
import { PositionWithMeta } from "../sdk/types";

export const useAssignProxies = () => {
  const { provider, registrar, refetch, voteService } = useHeliumVsrState();
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

      if (isInvalid || !nftProxyProgram || !registrar || !voteService) {
        throw new Error("Unable to voting delegate, Invalid params");
      } else {
        const instructions: TransactionInstruction[] = [];
        for (const position of positions) {
          let currentProxyAssignment = proxyAssignmentKey(
            registrar.proxyConfig,
            position.mint,
            provider.wallet.publicKey
          )[0];
          let proxyAssignment = await nftProxyProgram.account.proxyAssignmentV0.fetchNullable(
            currentProxyAssignment
          );
          if (!proxyAssignment) {
            currentProxyAssignment = proxyAssignmentKey(
              registrar.proxyConfig,
              position.mint,
              PublicKey.default
            )[0];
            proxyAssignment = await nftProxyProgram.account.proxyAssignmentV0.fetchNullable(currentProxyAssignment);
          }
          if (proxyAssignment && !proxyAssignment.nextVoter?.equals(PublicKey.default)) {
            const toUndelegate =
              await voteService.getProxyAssignmentsForPosition(
                position.pubkey,
                proxyAssignment.index
              );
            const ixs = (
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
            ).filter(truthy);

            instructions.push(...ixs);
          }
          const {
            instruction,
            pubkeys: { nextProxyAssignment },
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
          if (await provider.connection.getAccountInfo(nextProxyAssignment!)) {
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