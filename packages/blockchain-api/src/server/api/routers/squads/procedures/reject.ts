import { publicProcedure } from "../../../procedures";
import * as multisig from "@sqds/multisig";
import { createSolanaConnection } from "@/lib/solana";
import { buildProposalVote, SQUADS_VOTE_ACTIONS } from "./helpers";

export const rejectProposal = publicProcedure.squads.rejectProposal.handler(
  async ({ input, errors }) => {
    const { connection } = createSolanaConnection(input.member);
    return buildProposalVote({
      input,
      connection,
      buildIx: multisig.instructions.proposalReject,
      action: SQUADS_VOTE_ACTIONS.reject,
      insufficientFunds: ({ required, available }) =>
        errors.INSUFFICIENT_FUNDS({
          message: "Insufficient SOL balance to reject the proposal",
          data: { required, available },
        }),
    });
  },
);
