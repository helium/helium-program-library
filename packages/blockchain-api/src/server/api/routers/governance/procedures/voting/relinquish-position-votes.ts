import { publicProcedure } from "@/server/api/procedures";
import { createSolanaConnection } from "@/lib/solana";
import { getTotalTransactionFees } from "@/lib/utils/balance-validation";
import { toTokenAmountOutput } from "@/lib/utils/token-math";
import {
  generateTransactionTag,
  TRANSACTION_TYPES,
} from "@/lib/utils/transaction-tags";
import { init as initOrg, proposalKey } from "@helium/organization-sdk";
import { init as initProposal } from "@helium/proposal-sdk";
import { truthy } from "@helium/spl-utils";
import {
  init as initVsr,
  positionKey,
  voteMarkerKey,
} from "@helium/voter-stake-registry-sdk";
import { NATIVE_MINT } from "@solana/spl-token";
import { PublicKey, TransactionInstruction } from "@solana/web3.js";
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

      const activeProposals = proposalKeys
        .map((pubkey, idx) => ({ account: proposalAccounts[idx], pubkey }))
        .filter(
          (p) =>
            p.account &&
            typeof p.account.state.voting !== "undefined" &&
            typeof p.account.state.resolved === "undefined",
        );

      const markerKeys = activeProposals.map(
        (p) => voteMarkerKey(positionMintPubkey, p.pubkey)[0],
      );

      const markers = (
        await vsrProgram.account.voteMarkerV0.fetchMultiple(markerKeys)
      ).filter(truthy);

      if (markers.length === 0) {
        throw errors.BAD_REQUEST({
          message: "No active vote markers found for this position",
        });
      }

      const groups: InstructionGroup[] = [];

      for (const marker of markers) {
        const instructions: TransactionInstruction[] = [];
        for (const choice of marker.choices) {
          instructions.push(
            await vsrProgram.methods
              .relinquishVoteV1({ choice })
              .accountsPartial({
                proposal: marker.proposal,
                voter: walletPubkey,
                position: positionPubkey,
              })
              .instruction(),
          );
        }
        groups.push({
          instructions,
          metadata: {
            type: "voting_relinquish_all",
            description: "Relinquish all votes from position",
            votesRelinquished: instructions.length,
          },
        });
      }

      const { transactions, versionedTransactions, hasMore } =
        await buildBatchedTransactions({
          groups,
          connection,
          feePayer: walletPubkey,
        });

      const totalFee = getTotalTransactionFees(versionedTransactions);

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
          actionMetadata: { type: "voting_relinquish_position", positionMint, organization },
        },
        hasMore,
        estimatedSolFee: toTokenAmountOutput(
          new BN(totalFee),
          NATIVE_MINT.toBase58(),
        ),
      };
    },
  );
