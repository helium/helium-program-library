import { publicProcedure } from "../../../procedures";
import * as multisig from "@sqds/multisig";
import { createSolanaConnection } from "@/lib/solana";
import { buildProposalVote, SQUADS_VOTE_ACTIONS } from "./helpers";

export const approveProposal = publicProcedure.squads.approveProposal.handler(
  async ({ input, errors }) => {
    const { connection } = createSolanaConnection(input.member);
    return buildProposalVote({
      input,
      connection,
      buildIx: multisig.instructions.proposalApprove,
      action: SQUADS_VOTE_ACTIONS.approve,
      insufficientFunds: ({ required, available }) =>
        errors.INSUFFICIENT_FUNDS({
          message: "Insufficient SOL balance to approve the proposal",
          data: { required, available },
        }),
    });
  },
);
