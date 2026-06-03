import { PROGRAM_ID, init, proxyAssignmentKey } from "@helium/nft-proxy-sdk";
import {
  Status,
  batchParallelInstructionsWithPriorityFee,
  fetchBackwardsCompatibleIdl,
  truthy,
} from "@helium/spl-utils";
import {
  ProxyAssignment,
  proxyVoteMarkerKey,
} from "@helium/voter-stake-registry-sdk";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";
import {
  PublicKey,
  SystemProgram,
  TransactionInstruction,
} from "@solana/web3.js";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import BN from "bn.js";
import { INDEXER_WAIT } from "../constants";
import { useHeliumVsrState } from "../contexts/heliumVsrContext";
import { PositionWithMeta } from "../sdk/types";
import {
  organizationKey,
  PROGRAM_ID as ORG_PROGRAM_ID,
  init as orgInit,
  proposalKey,
} from "@helium/organization-sdk";
import {
  init as proposalInit,
  PROGRAM_ID as PROPOSAL_PROGRAM_ID,
} from "@helium/proposal-sdk";
import {
  init as initVsr,
  PROGRAM_ID as VSR_PROGRAM_ID,
} from "@helium/voter-stake-registry-sdk";
import { init as hplCronsInit, TASK_QUEUE_ID } from "@helium/hpl-crons-sdk";
import {
  customSignerKey,
  nextAvailableTaskIds,
  taskKey,
  taskQueueAuthorityKey,
  init as tuktukInit,
} from "@helium/tuktuk-sdk";

export const useAssignProxies = () => {
  const { provider, registrar, voteService, refetch } = useHeliumVsrState();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      positions,
      recipient,
      programId = PROGRAM_ID,
      expirationTime,
      orgProgramId = ORG_PROGRAM_ID,
      proposalProgramId = PROPOSAL_PROGRAM_ID,
      vsrProgramId = VSR_PROGRAM_ID,
      onInstructions,
      onProgress,
      maxSignatureBatch,
    }: {
      positions: PositionWithMeta[];
      recipient: PublicKey;
      programId?: PublicKey;
      proposalProgramId?: PublicKey;
      orgProgramId?: PublicKey;
      vsrProgramId?: PublicKey;
      expirationTime: BN;
      onInstructions?: (
        instructions: TransactionInstruction[][]
      ) => Promise<void>;
      onProgress?: (status: Status) => void;
      maxSignatureBatch?: number;
    }) => {
      const isInvalid = !provider;
      const idl = await fetchBackwardsCompatibleIdl(programId, provider as any);
      const nftProxyProgram = await init(provider as any, programId, idl);
      const orgProgram = await orgInit(provider as any, orgProgramId);
      const proposalProgram = await proposalInit(
        provider as any,
        proposalProgramId
      );
      const vsrProgram = await initVsr(provider as any, vsrProgramId);
      const hplCronsProgram = await hplCronsInit(provider as any);
      const tuktukProgram = await tuktukInit(provider as any);
      const hntOrg = organizationKey("Helium")[0];
      const organization = await orgProgram.account.organizationV0.fetch(
        hntOrg
      );
      // Only check last 10 proposals for active ones.
      const proposalKeys = Array(Math.min(10, organization?.numProposals || 0))
        .fill(0)
        .map((_, index) => {
          return proposalKey(hntOrg, organization!.numProposals - index - 1)[0];
        });

      const openProposals = (
        await proposalProgram.account.proposalV0.fetchMultiple(proposalKeys)
      )
        .map((account, index) => ({ account, pubkey: proposalKeys[index] }))
        .filter((prop) => !!prop?.account?.state.voting);
      const proxyVoteKeys = openProposals.map(
        (prop) => proxyVoteMarkerKey(recipient, prop.pubkey)[0]
      );
      const proxyVoteAccounts =
        await vsrProgram.account.proxyMarkerV0.fetchMultiple(proxyVoteKeys);
      const activeProxyVotes = openProposals
        .map((prop, index) => ({
          proposalPubkey: prop.pubkey,
          proxyMarkerPubkey: proxyVoteKeys[index],
          marker: proxyVoteAccounts[index],
        }))
        .filter((v) => (v.marker?.choices?.length || 0) > 0);

      let resultingAssignments: ProxyAssignment[] = [];
      let undelegated: ProxyAssignment[] = [];

      if (isInvalid || !nftProxyProgram || !registrar || !voteService) {
        throw new Error("Unable to voting delegate, Invalid params");
      } else {
        const instructions: TransactionInstruction[][] = [];
        // The proxy's votes can only propagate to delegated positions, so we
        // only kick the proxy-vote cron when at least one delegated position is
        // in this assignment.
        let hasDelegatedAssignment = false;
        for (const position of positions) {
          let currentProxyAssignment = position.proxy?.address;
          const proxyAssignment = position.proxy;
          const ownedAssetProxyAssignmentAddress = proxyAssignmentKey(
            registrar.proxyConfig,
            position.mint,
            PublicKey.default
          )[0];
          if (!proxyAssignment) {
            currentProxyAssignment = ownedAssetProxyAssignmentAddress;
          }
          const subInstructions: TransactionInstruction[] = [];
          if (
            proxyAssignment &&
            !proxyAssignment.nextVoter?.equals(PublicKey.default) &&
            // Only unassign if the proxy is actually changing
            !proxyAssignment.nextVoter.equals(recipient)
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
                    .accountsPartial({
                      asset: position.mint,
                      prevProxyAssignment,
                      currentProxyAssignment,
                      proxyAssignment: new PublicKey(proxy.address),
                      voter: currentProxyAssignment?.equals(
                        ownedAssetProxyAssignmentAddress
                      )
                        ? PublicKey.default
                        : provider.wallet.publicKey,
                      approver: provider.wallet.publicKey,
                      tokenAccount: currentProxyAssignment?.equals(
                        ownedAssetProxyAssignmentAddress
                      )
                        ? getAssociatedTokenAddressSync(
                            position.mint,
                            provider.wallet.publicKey
                          )
                        : PROGRAM_ID,
                    })
                    .instruction();
                })
              )
            ).filter(truthy);

            subInstructions.push(...ixs);
          }

          const { instruction } = await nftProxyProgram.methods
            .assignProxyV0({
              expirationTime,
            })
            .accountsPartial({
              asset: position.mint,
              recipient,
              proxyConfig: registrar.proxyConfig,
              voter: currentProxyAssignment?.equals(
                ownedAssetProxyAssignmentAddress
              )
                ? PublicKey.default
                : provider.wallet.publicKey,
              approver: provider.wallet.publicKey,
              tokenAccount: currentProxyAssignment?.equals(
                ownedAssetProxyAssignmentAddress
              )
                ? getAssociatedTokenAddressSync(
                    position.mint,
                    provider.wallet.publicKey
                  )
                : PROGRAM_ID,
            })
            .prepare();
          resultingAssignments.push({
            address: currentProxyAssignment!.toBase58(),
            asset: position.mint.toBase58(),
            nextVoter: recipient.toBase58(),
            voter: position.isProxiedToMe
              ? provider.wallet.publicKey.toBase58()
              : PublicKey.default.toBase58(),
            proxyConfig: registrar.proxyConfig.toBase58(),
            index: 0,
            expirationTime:
              proxyAssignment?.expirationTime?.toString() ||
              expirationTime.toString(),
            rentRefund:
              proxyAssignment?.rentRefund?.toBase58() || recipient.toBase58(),
            bumpSeed: proxyAssignment?.bumpSeed || 0,
          });

          subInstructions.push(instruction);
          if (position.isDelegated) {
            hasDelegatedAssignment = true;
          }
          instructions.push(subInstructions);
        }

        // If the proxy has already voted on an active proposal, that vote was
        // cast before these positions were delegated to it, so the newly
        // delegated positions aren't covered. Queueing a proxy-vote task lets
        // the vote-service cron count the votes for them and schedule each
        // marker's relinquish via the task-queue PDA (the only signer
        // authorized to do so).
        if (hasDelegatedAssignment && activeProxyVotes.length > 0) {
          const taskQueueAcc = await tuktukProgram.account.taskQueueV0.fetch(
            TASK_QUEUE_ID
          );
          const nextAvailable = nextAvailableTaskIds(
            taskQueueAcc.taskBitmap,
            activeProxyVotes.length
          );
          const queueAuthority = PublicKey.findProgramAddressSync(
            [Buffer.from("queue_authority")],
            hplCronsProgram.programId
          )[0];

          const proxyVoteTaskInstructions: TransactionInstruction[] = [];
          for (const vote of activeProxyVotes) {
            if (nextAvailable.length === 0) {
              throw new Error(
                "No available tuktuk task IDs to queue proxy vote"
              );
            }
            const freeTaskId = nextAvailable.pop()!;
            proxyVoteTaskInstructions.push(
              await hplCronsProgram.methods
                // @ts-ignore queueProxyVoteV0 is missing from the published IDL types
                .queueProxyVoteV0({ freeTaskId })
                .accountsPartial({
                  marker: vote.proxyMarkerPubkey,
                  task: taskKey(TASK_QUEUE_ID, freeTaskId)[0],
                  taskQueue: TASK_QUEUE_ID,
                  payer: provider.wallet.publicKey,
                  systemProgram: SystemProgram.programId,
                  queueAuthority,
                  tuktukProgram: tuktukProgram.programId,
                  voter: recipient,
                  pdaWallet: customSignerKey(TASK_QUEUE_ID, [
                    Buffer.from("vote_payer"),
                    recipient.toBuffer(),
                  ])[0],
                  taskQueueAuthority: taskQueueAuthorityKey(
                    TASK_QUEUE_ID,
                    queueAuthority
                  )[0],
                })
                .instruction()
            );
          }
          instructions.push(proxyVoteTaskInstructions);
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
            await refetch();
          } catch (e: any) {
            console.error("Exception invalidating queries", e);
          }
        }, INDEXER_WAIT);
      }
    },
  });
};
