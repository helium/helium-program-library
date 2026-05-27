import { publicProcedure } from "@/server/api/procedures";
import { createSolanaConnection, getCluster } from "@/lib/solana";
import { getTotalTransactionFees } from "@/lib/utils/balance-validation";
import { getJitoTipAmountLamports } from "@/lib/utils/jito";
import { toTokenAmountOutput } from "@/lib/utils/token-math";
import {
  generateTransactionTag,
  TRANSACTION_TYPES,
} from "@/lib/utils/transaction-tags";
import { init as initOrg, proposalKey } from "@helium/organization-sdk";
import { init as initProposal } from "@helium/proposal-sdk";
import {
  init as initVsr,
  positionKey,
  voteMarkerKey,
} from "@helium/voter-stake-registry-sdk";
import { NATIVE_MINT } from "@solana/spl-token";
import {
  PublicKey,
  SystemProgram,
  TransactionInstruction,
} from "@solana/web3.js";
import BN from "bn.js";
import { requirePositionOwnership, buildBatchedTransactions } from "../helpers";
import type { InstructionGroup } from "../helpers";

export const relinquishPositionVotes =
  publicProcedure.governance.relinquishPositionVotes.handler(
    async ({ input, errors }) => {
      const { walletAddress, positionMint, organization } = input;

      const { connection, provider } = createSolanaConnection(walletAddress);
      const walletPubkey = new PublicKey(walletAddress);
      const positionMintPubkey = new PublicKey(positionMint);
      const organizationPubkey = new PublicKey(organization);

      const vsrProgram = await initVsr(provider);
      const orgProgram = await initOrg(provider);
      const proposalProgram = await initProposal(provider);

      const [positionPubkey] = positionKey(positionMintPubkey);
      const positionAcc =
        await vsrProgram.account.positionV0.fetchNullable(positionPubkey);

      if (!positionAcc) {
        throw errors.NOT_FOUND({ message: "Position not found" });
      }

      await requirePositionOwnership(
        connection,
        positionMintPubkey,
        walletPubkey,
        errors,
      );

      if (positionAcc.numActiveVotes === 0) {
        throw errors.BAD_REQUEST({
          message: "Position has no active votes to relinquish",
        });
      }

      const organizationAcc =
        await orgProgram.account.organizationV0.fetchNullable(
          organizationPubkey,
        );

      if (!organizationAcc) {
        throw errors.NOT_FOUND({ message: "Organization not found" });
      }

      const proposalKeys = Array(organizationAcc.numProposals)
        .fill(0)
        .map((_, index) => proposalKey(organizationPubkey, index)[0])
        .reverse();

      const proposalAccounts =
        await proposalProgram.account.proposalV0.fetchMultiple(proposalKeys);

      const proposals = proposalKeys.flatMap((pubkey, idx) => {
        const account = proposalAccounts[idx];
        return account ? [{ account, pubkey }] : [];
      });

      const markerKeys = proposals.map(
        (p) => voteMarkerKey(positionMintPubkey, p.pubkey)[0],
      );

      const markers = (
        await vsrProgram.account.voteMarkerV0.fetchMultiple(markerKeys)
      ).map((marker, index) => ({
        marker,
        markerPubkey: markerKeys[index],
        proposal: proposals[index],
      }));

      const markersWithChoices = markers.flatMap((entry) =>
        entry.marker && entry.marker.choices.length > 0
          ? [{ ...entry, marker: entry.marker }]
          : [],
      );

      if (markersWithChoices.length === 0) {
        throw errors.BAD_REQUEST({
          message: "No vote markers found for this position",
        });
      }

      const groups: InstructionGroup[] = [];

      for (const { marker, markerPubkey, proposal } of markersWithChoices) {
        const instructions: TransactionInstruction[] = [];

        if (typeof proposal.account.state.voting !== "undefined") {
          for (const choice of marker.choices) {
            instructions.push(
              await vsrProgram.methods
                .relinquishVoteV1({ choice })
                .accountsPartial({
                  marker: markerPubkey,
                  proposal: marker.proposal,
                  voter: walletPubkey,
                  position: positionPubkey,
                })
                .instruction(),
            );
          }
        } else {
          instructions.push(
            await vsrProgram.methods
              .relinquishExpiredVoteV0()
              .accountsStrict({
                rentRefund: marker.rentRefund,
                marker: markerPubkey,
                position: positionPubkey,
                proposal: proposal.pubkey,
                systemProgram: SystemProgram.programId,
              })
              .instruction(),
          );
        }

        groups.push({
          instructions,
          metadata: {
            type: "voting_relinquish_all",
            description: "Relinquish all votes from position",
            votesRelinquished: marker.choices.length,
          },
        });
      }

      const { transactions, versionedTransactions, hasMore } =
        await buildBatchedTransactions({
          groups,
          connection,
          feePayer: walletPubkey,
        });

      const cluster = getCluster();
      const jitoTipCost =
        (cluster === "mainnet" || cluster === "mainnet-beta") &&
        versionedTransactions.length > 1
          ? getJitoTipAmountLamports()
          : 0;
      const totalFee =
        getTotalTransactionFees(versionedTransactions) + jitoTipCost;

      const walletBalance = await connection.getBalance(walletPubkey);
      if (walletBalance < totalFee) {
        throw errors.INSUFFICIENT_FUNDS({
          message: "Insufficient SOL balance for transaction fees",
          data: { required: totalFee, available: walletBalance },
        });
      }

      const tag = generateTransactionTag({
        type: TRANSACTION_TYPES.VOTING_RELINQUISH_ALL,
        walletAddress,
        positionMint,
        organization,
      });

      return {
        transactionData: {
          transactions,
          parallel: false,
          tag,
          actionMetadata: {
            type: "voting_relinquish_position",
            positionMint,
            organization,
          },
        },
        hasMore,
        estimatedSolFee: toTokenAmountOutput(
          new BN(totalFee),
          NATIVE_MINT.toBase58(),
        ),
      };
    },
  );
