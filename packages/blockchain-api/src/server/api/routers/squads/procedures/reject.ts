import { publicProcedure } from "../../../procedures";
import * as multisig from "@sqds/multisig";
import { createSolanaConnection } from "@/lib/solana";
import { TRANSACTION_TYPES } from "@/lib/utils/transaction-tags";
import { buildProposalVote } from "./helpers";

export const rejectProposal = publicProcedure.squads.rejectProposal.handler(
  async ({ input, errors }) => {
    const { connection } = createSolanaConnection(input.member);
    return buildProposalVote({
      input,
      connection,
      buildIx: multisig.instructions.proposalReject,
      tagType: TRANSACTION_TYPES.SQUADS_PROPOSAL_REJECT,
      metaType: "squads_proposal_reject",
      verb: "Reject",
      insufficientFunds: ({ required, available }) =>
        errors.INSUFFICIENT_FUNDS({
          message: "Insufficient SOL balance to reject the proposal",
          data: { required, available },
        }),
    });
  }
);
