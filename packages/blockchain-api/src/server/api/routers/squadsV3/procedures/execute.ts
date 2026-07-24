import { publicProcedure } from "../../../procedures";
import { PublicKey } from "@solana/web3.js";
import {
  generateTransactionTag,
  TRANSACTION_TYPES,
} from "@/lib/utils/transaction-tags";
import { buildSquadsTransaction } from "@/lib/utils/squads-tx";
import { createSquadsV3 } from "./helpers";

export const executeProposal = publicProcedure.squadsV3.executeProposal.handler(
  async ({ input, errors }) => {
    const { member, multisig: multisigAddress, transactionPda } = input;
    const memberKey = new PublicKey(member);
    const txPda = new PublicKey(transactionPda);
    const { connection, squads } = createSquadsV3(member);

    // Surface a missing or foreign account as NOT_FOUND up front;
    // buildExecuteTransaction reads and deserializes the account to assemble the
    // inner instruction accounts and would otherwise throw an opaque error.
    const account = await connection.getAccountInfo(txPda);
    if (!account || !account.owner.equals(squads.multisigProgramId)) {
      throw errors.NOT_FOUND({
        message: `No Squads v3 transaction found at ${transactionPda}`,
      });
    }

    const ix = await squads.buildExecuteTransaction(txPda, memberKey);

    const { serializedTransaction } = await buildSquadsTransaction({
      connection,
      member: memberKey,
      instructions: [ix],
      insufficientFunds: ({ required, available }) =>
        errors.INSUFFICIENT_FUNDS({
          message: "Insufficient SOL balance to execute the proposal",
          data: { required, available },
        }),
    });

    const tag = generateTransactionTag({
      type: TRANSACTION_TYPES.SQUADS_V3_PROPOSAL_EXECUTE,
      member,
      multisig: multisigAddress,
      transactionPda,
    });

    return {
      transactions: [
        {
          serializedTransaction,
          metadata: {
            type: TRANSACTION_TYPES.SQUADS_V3_PROPOSAL_EXECUTE,
            description: `Execute transaction ${transactionPda}`,
          },
        },
      ],
      parallel: false,
      tag,
      actionMetadata: {
        type: TRANSACTION_TYPES.SQUADS_V3_PROPOSAL_EXECUTE,
        multisig: multisigAddress,
        transactionPda,
      },
    };
  }
);
