import { oc } from "@orpc/contract";
import {
  SquadsV3ProposalVoteInputSchema,
  SquadsV3ExecuteProposalInputSchema,
  SquadsV3ProposeConfigChangeInputSchema,
} from "../schemas/squadsV3";
import { TransactionDataSchema } from "../schemas/common";
import { BAD_REQUEST, NOT_FOUND } from "../errors/common";
import { INSUFFICIENT_FUNDS } from "../errors/solana";

/**
 * Squads v3 multisig transaction lifecycle. Every endpoint builds one or more
 * unsigned transactions to be signed by the acting member and submitted via the
 * transactions router. v3 votes act directly on a transaction PDA (there is no
 * separate proposal account). Reads (list/inspect transactions) live in the
 * client SDK, not here.
 */
export const squadsV3Contract = oc.tag("Squads v3").router({
  approveProposal: oc
    .route({
      method: "POST",
      path: "/squads/v3/proposals/approve",
      summary: "Approve a Squads v3 transaction",
    })
    .input(SquadsV3ProposalVoteInputSchema)
    .output(TransactionDataSchema)
    .errors({ BAD_REQUEST, NOT_FOUND, INSUFFICIENT_FUNDS }),
  rejectProposal: oc
    .route({
      method: "POST",
      path: "/squads/v3/proposals/reject",
      summary: "Reject a Squads v3 transaction",
    })
    .input(SquadsV3ProposalVoteInputSchema)
    .output(TransactionDataSchema)
    .errors({ BAD_REQUEST, NOT_FOUND, INSUFFICIENT_FUNDS }),
  cancelProposal: oc
    .route({
      method: "POST",
      path: "/squads/v3/proposals/cancel",
      summary: "Cancel an approved Squads v3 transaction",
    })
    .input(SquadsV3ProposalVoteInputSchema)
    .output(TransactionDataSchema)
    .errors({ BAD_REQUEST, NOT_FOUND, INSUFFICIENT_FUNDS }),
  executeProposal: oc
    .route({
      method: "POST",
      path: "/squads/v3/proposals/execute",
      summary: "Execute an approved Squads v3 transaction",
    })
    .input(SquadsV3ExecuteProposalInputSchema)
    .output(TransactionDataSchema)
    .errors({ BAD_REQUEST, NOT_FOUND, INSUFFICIENT_FUNDS }),
  proposeConfigChange: oc
    .route({
      method: "POST",
      path: "/squads/v3/proposals/config",
      summary:
        "Propose a Squads v3 config change (add/remove member, change threshold)",
    })
    .input(SquadsV3ProposeConfigChangeInputSchema)
    .output(TransactionDataSchema)
    .errors({ BAD_REQUEST, NOT_FOUND, INSUFFICIENT_FUNDS }),
});
