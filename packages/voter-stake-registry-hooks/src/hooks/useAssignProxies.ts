import { Program } from "@coral-xyz/anchor";
import { PROGRAM_ID, init, proxyAssignmentKey } from "@helium/nft-proxy-sdk";
import {
  Status,
  batchParallelInstructionsWithPriorityFee,
  truthy,
} from "@helium/spl-utils";
import { PublicKey, TransactionInstruction } from "@solana/web3.js";
import BN from "bn.js";
import { useAsyncCallback } from "react-async-hook";
import { useHeliumVsrState } from "../contexts/heliumVsrContext";
import { PositionWithMeta, ProxyAssignmentV0 } from "../sdk/types";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ProxyAssignment } from "@helium/voter-stake-registry-sdk";
import { INDEXER_WAIT } from "../constants";

export const useAssignProxies = () => {
  const { provider, registrar, mint, voteService } = useHeliumVsrState();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
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

      let resultingAssignments: ProxyAssignment[] = [];
      let undelegated: ProxyAssignment[] = [];

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
          let proxyAssignment =
            await nftProxyProgram.account.proxyAssignmentV0.fetchNullable(
              currentProxyAssignment
            );
          if (!proxyAssignment) {
            currentProxyAssignment = proxyAssignmentKey(
              registrar.proxyConfig,
              position.mint,
              PublicKey.default
            )[0];
            proxyAssignment =
              await nftProxyProgram.account.proxyAssignmentV0.fetchNullable(
                currentProxyAssignment
              );
          }
          if (
            proxyAssignment &&
            !proxyAssignment.nextVoter?.equals(PublicKey.default)
          ) {
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
                  undelegated.push(...toUndelegate);
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
          resultingAssignments.push({
            address: nextProxyAssignment!.toBase58(),
            asset: position.mint.toBase58(),
            nextVoter: recipient.toBase58(),
            voter: position.isProxiedToMe
              ? provider.wallet.publicKey.toBase58()
              : PublicKey.default.toBase58(),
            proxyConfig: registrar.proxyConfig.toBase58(),
            index: 0,
            expirationTime: expirationTime.toString(),
            rentRefund: recipient.toBase58(),
            bumpSeed: 0,
          });
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

        queryClient.setQueryData<ProxyAssignment[]>(
          [
            "proxyAssignmentsForWallet",
            {
              registrar: voteService.registrar.toBase58(),
              wallet: provider.wallet.publicKey.toBase58(),
              mint: mint?.toBase58(),
            },
          ],
          (old) => {
            const changed = new Set(
              [...resultingAssignments, ...undelegated].map((r) => r.address)
            );
            return [
              ...(old || []).filter((todo) => !changed.has(todo.address)),
              ...resultingAssignments,
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
