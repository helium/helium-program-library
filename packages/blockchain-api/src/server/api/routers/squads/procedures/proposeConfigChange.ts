import { publicProcedure } from "../../../procedures";
import { PublicKey } from "@solana/web3.js";
import * as multisig from "@sqds/multisig";
import { createSolanaConnection } from "@/lib/solana";
import {
  generateTransactionTag,
  TRANSACTION_TYPES,
} from "@/lib/utils/transaction-tags";
import { buildSquadsTransaction, nextTransactionIndex } from "./helpers";

type ConfigActionInput =
  | { type: "addMember"; newMember: string; permissions?: string[] }
  | { type: "removeMember"; oldMember: string }
  | { type: "changeThreshold"; newThreshold: number };

const PERMISSION_BIT: Record<string, multisig.types.Permission> = {
  initiate: multisig.types.Permission.Initiate,
  vote: multisig.types.Permission.Vote,
  execute: multisig.types.Permission.Execute,
};

function toConfigAction(
  action: ConfigActionInput
): multisig.types.ConfigAction {
  switch (action.type) {
    case "addMember":
      return {
        __kind: "AddMember",
        newMember: {
          key: new PublicKey(action.newMember),
          permissions: action.permissions
            ? multisig.types.Permissions.fromPermissions(
                action.permissions.map((p) => PERMISSION_BIT[p])
              )
            : multisig.types.Permissions.all(),
        },
      };
    case "removeMember":
      return {
        __kind: "RemoveMember",
        oldMember: new PublicKey(action.oldMember),
      };
    case "changeThreshold":
      return { __kind: "ChangeThreshold", newThreshold: action.newThreshold };
  }
}

export const proposeConfigChange =
  publicProcedure.squads.proposeConfigChange.handler(
    async ({ input, errors }) => {
      const { member, multisig: multisigAddress, actions, memo } = input;
      const memberKey = new PublicKey(member);
      const multisigPda = new PublicKey(multisigAddress);
      const { connection } = createSolanaConnection(member);

      const transactionIndex = await nextTransactionIndex(
        connection,
        multisigPda
      ).catch(() => {
        throw errors.NOT_FOUND({
          message: `Multisig ${multisigAddress} not found`,
        });
      });

      const createIx = multisig.instructions.configTransactionCreate({
        multisigPda,
        creator: memberKey,
        transactionIndex,
        actions: actions.map(toConfigAction),
        memo,
      });
      const proposalIx = multisig.instructions.proposalCreate({
        multisigPda,
        creator: memberKey,
        transactionIndex,
      });

      const serializedTransaction = await buildSquadsTransaction({
        connection,
        member: memberKey,
        instructions: [createIx, proposalIx],
        insufficientFunds: ({ required, available }) =>
          errors.INSUFFICIENT_FUNDS({
            message: "Insufficient SOL balance to propose the config change",
            data: { required, available },
          }),
      });

      const indexStr = transactionIndex.toString();
      const tag = generateTransactionTag({
        type: TRANSACTION_TYPES.SQUADS_CONFIG_CHANGE,
        member,
        multisig: multisigAddress,
        transactionIndex: indexStr,
        actions: actions.map((a) => a.type),
      });

      return {
        transactions: [
          {
            serializedTransaction,
            metadata: {
              type: "squads_config_change",
              description: `Propose config change #${indexStr}`,
            },
          },
        ],
        parallel: false,
        tag,
        actionMetadata: {
          type: "squads_config_change",
          multisig: multisigAddress,
          transactionIndex: indexStr,
        },
      };
    }
  );
