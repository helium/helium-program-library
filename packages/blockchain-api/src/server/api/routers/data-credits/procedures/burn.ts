import { publicProcedure } from "../../../procedures";
import { PublicKey } from "@solana/web3.js";
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
import BN from "bn.js";

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

    const ix = await program.methods
      .burnWithoutTrackingV0({ amount: new BN(amount) })
      .accountsPartial({
        // `burnAccounts` is a composite account struct on the instruction;
        // its members must be nested, not flattened.
        burnAccounts: {
          burner: getAssociatedTokenAddressSync(DC_MINT, feePayer, true),
          dcMint: DC_MINT,
          dataCredits: dataCreditsKey(DC_MINT)[0],
          owner: feePayer,
        },
      })
      .instruction();

    const tx = await buildVersionedTransaction({
      connection,
      draft: { instructions: [ix], feePayer },
    });

    const txFee = getTransactionFee(tx);
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
