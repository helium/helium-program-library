import { PROGRAM_ID, init, proxyAssignmentKey } from "@helium/nft-proxy-sdk";
import {
  Status,
  batchParallelInstructionsWithPriorityFee,
  fetchBackwardsCompatibleIdl,
  truthy,
} from "@helium/spl-utils";
import { positionKey, ProxyAssignment, proxyVoteMarkerKey, voteMarkerKey } from "@helium/voter-stake-registry-sdk";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";
import { PublicKey, SystemProgram, TransactionInstruction } from "@solana/web3.js";
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
import { init as initVsr, PROGRAM_ID as VSR_PROGRAM_ID } from "@helium/voter-stake-registry-sdk";

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
      const proxyVoteKeys = openProposals.map((prop) => proxyVoteMarkerKey(recipient, prop.pubkey)[0]);
      const proxyVoteAccounts = (await vsrProgram.account.proxyMarkerV0.fetchMultiple(proxyVoteKeys)).map((account, index) => ({ account, pubkey: proxyVoteKeys[index] } )).filter(v => v.account);
      const proposalsByPubkey = openProposals.reduce((acc, prop) => {
        acc[prop.pubkey.toBase58()] = prop.account;
        return acc;
      }, {} as Record<string, any>);
      const proposalConfigKeys = [...new Set(
        openProposals
          .map((prop) => prop.account?.proposalConfig)
          .map((p) => p?.toBase58())
          .filter(truthy)
      )];
      const proposalConfigsByPubkey = (await proposalProgram.account.proposalConfigV0.fetchMultiple(proposalConfigKeys)).reduce((acc, pc, index) => {
        acc[proposalConfigKeys[index]] = pc;
        return acc;
      }, {} as Record<string, any>);
      const myVoteMarkerKeys = positions.map(position => openProposals.map(op => voteMarkerKey(position.mint, op.pubkey)[0])).flat();
      const myVoteMarkerAccounts = (
        await vsrProgram.account.voteMarkerV0.fetchMultiple(myVoteMarkerKeys)
      )
        .map((account, index) => ({ account, pubkey: myVoteMarkerKeys[index] }))
        .filter((v) => v.account)
        .reduce((acc, v) => {
          acc[v.pubkey.toBase58()] = v.account;
          return acc;
        }, {} as Record<string, any>) ;

      let resultingAssignments: ProxyAssignment[] = [];
      let undelegated: ProxyAssignment[] = [];

      if (isInvalid || !nftProxyProgram || !registrar || !voteService) {
        throw new Error("Unable to voting delegate, Invalid params");
      } else {
        const instructions: TransactionInstruction[][] = [];
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

          const {
            instruction,
            pubkeys: { nextProxyAssignment },
          } = await nftProxyProgram.methods
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
          for (const proxyMarker of proxyVoteAccounts) {
            const proposal =
              proposalsByPubkey[proxyMarker.account!.proposal.toBase58()];
            const proposalConfig =
              proposalConfigsByPubkey[proposal.proposalConfig.toBase58()];
            const voteMarkerK = voteMarkerKey(
              position.mint,
              proxyMarker.account!.proposal
            )[0];
            const voteMarker = myVoteMarkerAccounts[voteMarkerK.toBase58()];
            if (position.isDelegated && !voteMarker && (proxyMarker.account?.choices?.length || 0) > 0) {
              subInstructions.push(
                await vsrProgram.methods
                  .countProxyVoteV0()
                  .accountsPartial({
                    payer: provider.wallet.publicKey,
                    proxyMarker: proxyMarker.pubkey,
                    marker: voteMarkerK,
                    voter: proxyMarker.account!.voter,
                    proxyAssignment: nextProxyAssignment,
                    registrar: position.registrar,
                    position: positionKey(position.mint)[0],
                    proposal: proxyMarker.account!.proposal,
                    proposalConfig: proposal.proposalConfig,
                    stateController: proposalConfig.stateController,
                    onVoteHook: proposalConfig.onVoteHook,
                    proposalProgram: proposalProgramId,
                    systemProgram: SystemProgram.programId,
                  })
                  .instruction()
              );
            }
          }
          instructions.push(subInstructions);
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
