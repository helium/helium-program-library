import { publicProcedure } from "../../../procedures";
import { PublicKey } from "@solana/web3.js";
import { createSolanaConnection } from "@/lib/solana";
import { init as initDc, mintDataCredits } from "@helium/data-credits-sdk";
import { serializeTransaction } from "@/lib/utils/build-transaction";
import {
  generateTransactionTag,
  TRANSACTION_TYPES,
} from "@/lib/utils/transaction-tags";
import BN from "bn.js";

export const mint = publicProcedure.dataCredits.mint.handler(
  async ({ input, errors }) => {
    const { owner, dcAmount, hntAmount, recipient } = input;

    if (!dcAmount && !hntAmount) {
      throw errors.BAD_REQUEST({
        message: "Either dcAmount or hntAmount must be provided",
      });
    }

    if (dcAmount && hntAmount) {
      throw errors.BAD_REQUEST({
        message: "Provide only one of dcAmount or hntAmount, not both",
      });
    }

    const { provider } = createSolanaConnection(owner);

    const program = await initDc(provider);

    const { txs } = await mintDataCredits({
      program,
      dcAmount: dcAmount ? new BN(dcAmount) : undefined,
      hntAmount: hntAmount ? new BN(hntAmount) : undefined,
      recipient: recipient ? new PublicKey(recipient) : undefined,
    });

    const tag = generateTransactionTag({
      type: TRANSACTION_TYPES.MINT_DATA_CREDITS,
      userAddress: owner,
      dcAmount: dcAmount || undefined,
      hntAmount: hntAmount || undefined,
    });

    return {
      transactions: txs.map((t) => ({
        serializedTransaction: serializeTransaction(t.tx),
        metadata: {
          type: "mint_data_credits",
          description: dcAmount
            ? `Mint ${dcAmount} data credits`
            : `Burn ${hntAmount} HNT bones for data credits`,
        },
      })),
      parallel: false,
      tag,
      actionMetadata: { type: "mint_data_credits", dcAmount: dcAmount || undefined, hntAmount: hntAmount || undefined, recipient: recipient || undefined },
    };
  }
);
