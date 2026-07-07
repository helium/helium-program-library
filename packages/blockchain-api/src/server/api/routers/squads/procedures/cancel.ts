import { publicProcedure } from "../../../procedures";
import * as multisig from "@sqds/multisig";
import { createSolanaConnection } from "@/lib/solana";
import { TRANSACTION_TYPES } from "@/lib/utils/transaction-tags";
import { buildProposalVote } from "./helpers";

export const cancelProposal = publicProcedure.squads.cancelProposal.handler(
  async ({ input, errors }) => {
    const { connection } = createSolanaConnection(input.member);
    return buildProposalVote({
      input,
      connection,
      buildIx: multisig.instructions.proposalCancel,
      tagType: TRANSACTION_TYPES.SQUADS_PROPOSAL_CANCEL,
      metaType: "squads_proposal_cancel",
      verb: "Cancel",
      insufficientFunds: ({ required, available }) =>
        errors.INSUFFICIENT_FUNDS({
          message: "Insufficient SOL balance to cancel the proposal",
          data: { required, available },
        }),
    });
  }
);
