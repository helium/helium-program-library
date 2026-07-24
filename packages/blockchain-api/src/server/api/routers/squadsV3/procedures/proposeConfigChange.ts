import { publicProcedure } from "../../../procedures";
import { PublicKey } from "@solana/web3.js";
import Squads from "@sqds/sdk";
import {
  generateTransactionTag,
  TRANSACTION_TYPES,
} from "@/lib/utils/transaction-tags";
import { buildSquadsTransaction } from "@/lib/utils/squads-tx";
import { CONFIG_AUTHORITY_INDEX, createSquadsV3 } from "./helpers";

type TransactionBuilder = Awaited<
  ReturnType<Squads["getTransactionBuilder"]>
>;

type ConfigAction =
  | { type: "addMember"; newMember: string }
  | { type: "removeMember"; oldMember: string }
  | { type: "changeThreshold"; newThreshold: number };

/** Apply a single config action to the running transaction builder. */
function applyAction(
  builder: TransactionBuilder,
  action: ConfigAction
): Promise<TransactionBuilder> {
  switch (action.type) {
    case "addMember":
      return builder.withAddMember(new PublicKey(action.newMember));
    case "removeMember":
      return builder.withRemoveMember(new PublicKey(action.oldMember));
    case "changeThreshold":
      return builder.withChangeThreshold(action.newThreshold);
  }
}

export const proposeConfigChange =
  publicProcedure.squadsV3.proposeConfigChange.handler(
    async ({ input, errors }) => {
      const { member, multisig: multisigAddress, actions } = input;
      const memberKey = new PublicKey(member);
      const multisigPda = new PublicKey(multisigAddress);
      const { connection, squads } = createSquadsV3(member);

      // Config-change instructions require the multisig account as signer, so
      // the wrapping transaction is created under the internal authority index.
      let builder = await squads
        .getTransactionBuilder(multisigPda, CONFIG_AUTHORITY_INDEX)
        .catch(() => {
          throw errors.NOT_FOUND({
            message: `Multisig ${multisigAddress} not found`,
          });
        });
      for (const action of actions) {
        builder = await applyAction(builder, action);
      }

      // getInstructions yields the create + per-instruction add ixs; activate
      // moves the transaction from draft to votable, mirroring v4's proposalCreate.
      const [createIxs, transactionPda] = await builder.getInstructions();
      const activateIx = await squads.buildActivateTransaction(
        multisigPda,
        transactionPda
      );

      const { serializedTransaction } = await buildSquadsTransaction({
        connection,
        member: memberKey,
        instructions: [...createIxs, activateIx],
        insufficientFunds: ({ required, available }) =>
          errors.INSUFFICIENT_FUNDS({
            message: "Insufficient SOL balance to propose the config change",
            data: { required, available },
          }),
      });

      const transactionPdaStr = transactionPda.toBase58();
      const tag = generateTransactionTag({
        type: TRANSACTION_TYPES.SQUADS_V3_CONFIG_CHANGE,
        member,
        multisig: multisigAddress,
        transactionPda: transactionPdaStr,
        actions: actions.map((a) => a.type),
      });

      return {
        transactions: [
          {
            serializedTransaction,
            metadata: {
              type: TRANSACTION_TYPES.SQUADS_V3_CONFIG_CHANGE,
              description: `Propose config change ${transactionPdaStr}`,
            },
          },
        ],
        parallel: false,
        tag,
        actionMetadata: {
          type: TRANSACTION_TYPES.SQUADS_V3_CONFIG_CHANGE,
          multisig: multisigAddress,
          transactionPda: transactionPdaStr,
        },
      };
    }
  );
