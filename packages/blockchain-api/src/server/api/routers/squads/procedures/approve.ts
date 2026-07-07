import { publicProcedure } from "../../../procedures";
import * as multisig from "@sqds/multisig";
import { createSolanaConnection } from "@/lib/solana";
import { TRANSACTION_TYPES } from "@/lib/utils/transaction-tags";
import { buildProposalVote } from "./helpers";

export const approveProposal = publicProcedure.squads.approveProposal.handler(
  async ({ input, errors }) => {
    const { connection } = createSolanaConnection(input.member);
    return buildProposalVote({
      input,
      connection,
      buildIx: multisig.instructions.proposalApprove,
      tagType: TRANSACTION_TYPES.SQUADS_PROPOSAL_APPROVE,
      metaType: "squads_proposal_approve",
      verb: "Approve",
      insufficientFunds: ({ required, available }) =>
        errors.INSUFFICIENT_FUNDS({
          message: "Insufficient SOL balance to approve the proposal",
          data: { required, available },
        }),
    });
  }
);
