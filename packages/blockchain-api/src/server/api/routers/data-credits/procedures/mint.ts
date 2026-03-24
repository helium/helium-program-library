import { publicProcedure } from "../../../procedures";
import { PublicKey } from "@solana/web3.js";
import { createSolanaConnection, getCluster } from "@/lib/solana";
import { init as initDc, mintDataCredits } from "@helium/data-credits-sdk";
import { serializeTransaction } from "@/lib/utils/build-transaction";
import {
  generateTransactionTag,
  TRANSACTION_TYPES,
} from "@/lib/utils/transaction-tags";
import { getJitoTipTransaction, shouldUseJitoBundle } from "@/lib/utils/jito";
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

    const transactions = txs.map((t) => {
      if (t.signers.length > 0) {
        t.tx.sign(t.signers);
      }
      return {
        serializedTransaction: serializeTransaction(t.tx),
        metadata: {
          type: "mint_data_credits",
          description: dcAmount
            ? `Mint ${dcAmount} data credits`
            : `Burn ${hntAmount} HNT bones for data credits`,
        },
      };
    });

    if (shouldUseJitoBundle(txs.length, getCluster())) {
      const tipTx = await getJitoTipTransaction(new PublicKey(owner));
      transactions.push({
        serializedTransaction: serializeTransaction(tipTx),
        metadata: {
          type: "jito_tip",
          description: "Jito bundle tip",
        },
      });
    }

    return {
      transactions,
      parallel: false,
      tag,
    };
  }
);
