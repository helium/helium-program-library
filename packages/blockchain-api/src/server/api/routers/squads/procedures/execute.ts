import { publicProcedure } from "../../../procedures";
import { PublicKey, TransactionInstruction } from "@solana/web3.js";
import * as multisig from "@sqds/multisig";
import { createSolanaConnection } from "@/lib/solana";
import {
  generateTransactionTag,
  TRANSACTION_TYPES,
} from "@/lib/utils/transaction-tags";
import { buildSquadsTransaction } from "./helpers";

export const executeProposal = publicProcedure.squads.executeProposal.handler(
  async ({ input, errors }) => {
    const { member, multisig: multisigAddress, transactionIndex } = input;
    const memberKey = new PublicKey(member);
    const multisigPda = new PublicKey(multisigAddress);
    const index = BigInt(transactionIndex);
    const { connection } = createSolanaConnection(member);

    // A proposal's transaction index can back either a vault transaction (an
    // action proposal) or a config transaction (a membership/threshold
    // change); each executes with a different Squads instruction. Read the
    // transaction account once and detect which it is by its discriminator.
    const [transactionPda] = multisig.getTransactionPda({
      multisigPda,
      index,
    });
    const account = await connection.getAccountInfo(transactionPda);
    if (!account) {
      throw errors.NOT_FOUND({
        message: `No Squads transaction found at index ${transactionIndex}`,
      });
    }

    const discriminator = account.data.subarray(0, 8);
    const kind = discriminator.equals(
      Buffer.from(multisig.accounts.vaultTransactionDiscriminator)
    )
      ? "vault"
      : discriminator.equals(
          Buffer.from(multisig.accounts.configTransactionDiscriminator)
        )
      ? "config"
      : null;
    if (!kind) {
      throw errors.BAD_REQUEST({
        message: `Transaction at index ${transactionIndex} is neither a vault nor a config transaction`,
      });
    }

    let instructions: TransactionInstruction[];
    let addressLookupTableAddresses: PublicKey[] = [];
    if (kind === "vault") {
      const { instruction, lookupTableAccounts } =
        await multisig.instructions.vaultTransactionExecute({
          connection,
          multisigPda,
          transactionIndex: index,
          member: memberKey,
        });
      instructions = [instruction];
      addressLookupTableAddresses = lookupTableAccounts.map((a) => a.key);
    } else {
      instructions = [
        multisig.instructions.configTransactionExecute({
          multisigPda,
          transactionIndex: index,
          member: memberKey,
        }),
      ];
    }

    const { serializedTransaction } = await buildSquadsTransaction({
      connection,
      member: memberKey,
      instructions,
      addressLookupTableAddresses,
      insufficientFunds: ({ required, available }) =>
        errors.INSUFFICIENT_FUNDS({
          message: "Insufficient SOL balance to execute the proposal",
          data: { required, available },
        }),
    });

    const tag = generateTransactionTag({
      type: TRANSACTION_TYPES.SQUADS_PROPOSAL_EXECUTE,
      member,
      multisig: multisigAddress,
      transactionIndex,
    });

    return {
      transactions: [
        {
          serializedTransaction,
          metadata: {
            type: TRANSACTION_TYPES.SQUADS_PROPOSAL_EXECUTE,
            description: `Execute proposal #${transactionIndex}`,
          },
        },
      ],
      parallel: false,
      tag,
      actionMetadata: {
        type: TRANSACTION_TYPES.SQUADS_PROPOSAL_EXECUTE,
        multisig: multisigAddress,
        transactionIndex,
        kind,
      },
    };
  }
);
