import { publicProcedure } from "../../../procedures";
import { PublicKey, TransactionInstruction } from "@solana/web3.js";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";
import { createSolanaConnection } from "@/lib/solana";
import { init as initDc, dataCreditsKey } from "@helium/data-credits-sdk";
import { DC_MINT } from "@helium/spl-utils";
import {
  buildVersionedTransaction,
  serializeTransaction,
} from "@/lib/utils/build-transaction";
import {
  generateTransactionTag,
  TRANSACTION_TYPES,
} from "@/lib/utils/transaction-tags";
import { getTransactionFee } from "@/lib/utils/balance-validation";
import {
  buildActionProposal,
  proposalTransactionData,
} from "../../squads/procedures/helpers";
import BN from "bn.js";

/** Burn `amount` DC (burnWithoutTrackingV0) from `authority`'s DC account. */
async function buildBurnDcInstruction(
  program: Awaited<ReturnType<typeof initDc>>,
  authority: PublicKey,
  amount: string
): Promise<TransactionInstruction> {
  return program.methods
    .burnWithoutTrackingV0({ amount: new BN(amount) })
    .accountsPartial({
      // `burnAccounts` is a composite account struct on the instruction;
      // its members must be nested, not flattened.
      burnAccounts: {
        burner: getAssociatedTokenAddressSync(DC_MINT, authority, true),
        dcMint: DC_MINT,
        dataCredits: dataCreditsKey(DC_MINT)[0],
        owner: authority,
      },
    })
    .instruction();
}

/**
 * Burn data credits directly from the owner's DC account
 * (burnWithoutTrackingV0). Delegated-DC burns are a separate, heavier flow and
 * are not handled here.
 */
export const burn = publicProcedure.dataCredits.burn.handler(
  async ({ input, errors }) => {
    const { owner, amount } = input;

    const { provider, connection } = createSolanaConnection(owner);
    const feePayer = new PublicKey(owner);
    const program = await initDc(provider);

    // ---- Squads propose mode: burn from the vault's DC account ----
    if (input.multisig) {
      const multisigPda = new PublicKey(input.multisig);
      const { serializedTransaction, transactionIndex } =
        await buildActionProposal({
          connection,
          multisigPda,
          member: feePayer,
          memo: input.memo,
          buildInstructions: async (vault) => [
            await buildBurnDcInstruction(program, vault, amount),
          ],
          errors,
          action: "DC burn",
        });

      return proposalTransactionData({
        serializedTransaction,
        type: TRANSACTION_TYPES.BURN_DATA_CREDITS_PROPOSAL,
        description: `Propose burn of ${amount} DC`,
        tag: generateTransactionTag({
          type: TRANSACTION_TYPES.BURN_DATA_CREDITS,
          userAddress: owner,
          amount,
          multisig: input.multisig,
        }),
        multisig: input.multisig,
        transactionIndex,
        actionMetadata: { amount },
      });
    }

    // ---- Direct burn from the owner ----
    const ix = await buildBurnDcInstruction(program, feePayer, amount);

    const tx = await buildVersionedTransaction({
      connection,
      draft: { instructions: [ix], feePayer },
    });

    const txFee = await getTransactionFee(connection, tx);
    const walletBalance = await connection.getBalance(feePayer);
    if (walletBalance < txFee) {
      throw errors.INSUFFICIENT_FUNDS({
        message: "Insufficient SOL balance to burn data credits",
        data: { required: txFee, available: walletBalance },
      });
    }

    const tag = generateTransactionTag({
      type: TRANSACTION_TYPES.BURN_DATA_CREDITS,
      userAddress: owner,
      amount,
    });

    return {
      transactions: [
        {
          serializedTransaction: serializeTransaction(tx),
          metadata: {
            type: "burn_data_credits",
            description: `Burn ${amount} DC`,
          },
        },
      ],
      parallel: false,
      tag,
      actionMetadata: { type: "burn_data_credits", amount },
    };
  }
);
