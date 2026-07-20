import { oc } from "@orpc/contract";
import {
  SquadsProposalVoteInputSchema,
  SquadsExecuteProposalInputSchema,
  SquadsProposeConfigChangeInputSchema,
} from "../schemas/squads";
import { TransactionDataSchema } from "../schemas/common";
import { BAD_REQUEST, NOT_FOUND } from "../errors/common";
import { INSUFFICIENT_FUNDS } from "../errors/solana";

/**
 * Squads v4 multisig proposal lifecycle. Every endpoint builds a single
 * unsigned transaction to be signed by the acting member and submitted via
 * the transactions router. Reads (list/inspect proposals) live in the client
 * SDK, not here.
 */
export const squadsContract = oc.tag("Squads").router({
  approveProposal: oc
    .route({
      method: "POST",
      path: "/squads/proposals/approve",
      summary: "Approve a Squads v4 proposal",
    })
    .input(SquadsProposalVoteInputSchema)
    .output(TransactionDataSchema)
    .errors({ BAD_REQUEST, NOT_FOUND, INSUFFICIENT_FUNDS }),
  rejectProposal: oc
    .route({
      method: "POST",
      path: "/squads/proposals/reject",
      summary: "Reject a Squads v4 proposal",
    })
    .input(SquadsProposalVoteInputSchema)
    .output(TransactionDataSchema)
    .errors({ BAD_REQUEST, NOT_FOUND, INSUFFICIENT_FUNDS }),
  cancelProposal: oc
    .route({
      method: "POST",
      path: "/squads/proposals/cancel",
      summary: "Cancel an approved Squads v4 proposal",
    })
    .input(SquadsProposalVoteInputSchema)
    .output(TransactionDataSchema)
    .errors({ BAD_REQUEST, NOT_FOUND, INSUFFICIENT_FUNDS }),
  executeProposal: oc
    .route({
      method: "POST",
      path: "/squads/proposals/execute",
      summary: "Execute an approved Squads v4 proposal (vault or config)",
    })
    .input(SquadsExecuteProposalInputSchema)
    .output(TransactionDataSchema)
    .errors({ BAD_REQUEST, NOT_FOUND, INSUFFICIENT_FUNDS }),
  proposeConfigChange: oc
    .route({
      method: "POST",
      path: "/squads/proposals/config",
      summary:
        "Propose a Squads v4 config change (add/remove member, change threshold)",
    })
    .input(SquadsProposeConfigChangeInputSchema)
    .output(TransactionDataSchema)
    .errors({ BAD_REQUEST, NOT_FOUND, INSUFFICIENT_FUNDS }),
});
