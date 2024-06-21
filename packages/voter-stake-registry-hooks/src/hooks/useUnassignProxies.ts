import { Program } from "@coral-xyz/anchor";
import { PROGRAM_ID, init, proxyAssignmentKey } from "@helium/nft-proxy-sdk";
import {
  Status,
  batchParallelInstructionsWithPriorityFee,
  truthy
} from "@helium/spl-utils";
import {
  ProxyAssignment
} from "@helium/voter-stake-registry-sdk";
import { PublicKey, TransactionInstruction } from "@solana/web3.js";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  INDEXER_WAIT,
  MAX_TRANSACTIONS_PER_SIGNATURE_BATCH,
} from "../constants";
import { useHeliumVsrState } from "../contexts/heliumVsrContext";
import { PositionWithMeta } from "../sdk/types";

export const useUnassignProxies = () => {
  const { provider, registrar, voteService, mint } = useHeliumVsrState();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
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

      if (isInvalid || !nftProxyProgram || !registrar || !voteService) {
        throw new Error("Unable to unassign proxy, Invalid params");
      } else {
        const instructions: TransactionInstruction[] = [];
        let undelegated: ProxyAssignment[] = [];
        for (const position of positions) {
          let currentProxyAssignment = proxyAssignmentKey(
            registrar.proxyConfig,
            position.mint,
            provider.wallet.publicKey
          )[0];
          let proxy =
            await nftProxyProgram.account.proxyAssignmentV0.fetchNullable(
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
          undelegated.push(...toUndelegate);

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

        queryClient.setQueryData<ProxyAssignment[]>(
          [
            "proxyAssignmentsForWallet",
            {
              ...voteService.config,
              wallet: provider.wallet.publicKey.toBase58(),
            },
          ],
          (old) => {
            const changed = new Set(undelegated.map((r) => r.address));
            return [
              ...(old || []).filter((todo) => !changed.has(todo.address)),
            ];
          }
        );

        // Give some time for indexers
        setTimeout(async () => {
          try {
            await queryClient.invalidateQueries({
              queryKey: ["proxies"],
            });
            await queryClient.invalidateQueries({
              queryKey: ["proxy"],
            });
          } catch (e: any) {
            console.error("Exception invalidating queries", e);
          }
        }, INDEXER_WAIT);
      }
    },
  });
};
