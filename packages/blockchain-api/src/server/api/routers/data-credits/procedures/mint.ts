import { publicProcedure } from "../../../procedures";
import { PublicKey } from "@solana/web3.js";
import { createSolanaConnection, getCluster } from "@/lib/solana";
import { init as initDc, mintDataCredits } from "@helium/data-credits-sdk";
import { DC_MINT } from "@helium/spl-utils";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";
import { serializeTransaction } from "@/lib/utils/build-transaction";
import {
  generateTransactionTag,
  TRANSACTION_TYPES,
} from "@/lib/utils/transaction-tags";
import {
  getJitoTipAmountLamports,
  getJitoTipTransaction,
  shouldUseJitoBundle,
} from "@/lib/utils/jito";
import {
  calculateRequiredBalance,
  getTotalTransactionFees,
  RENT_COSTS,
} from "@/lib/utils/balance-validation";
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

    const { provider, connection } = createSolanaConnection(owner);

    const program = await initDc(provider);

    const { txs } = await mintDataCredits({
      program,
      dcAmount: dcAmount ? new BN(dcAmount) : undefined,
      hntAmount: hntAmount ? new BN(hntAmount) : undefined,
      recipient: recipient ? new PublicKey(recipient) : undefined,
    });

    const useJito = shouldUseJitoBundle(txs.length, getCluster());
    const txFees = getTotalTransactionFees(txs.map((t) => t.tx));
    const jitoTipCost = useJito ? getJitoTipAmountLamports() : 0;

    // Check if recipient's DC ATA needs creation (init_if_needed on-chain)
    const recipientPubkey = recipient ? new PublicKey(recipient) : new PublicKey(owner);
    const recipientDcAta = getAssociatedTokenAddressSync(DC_MINT, recipientPubkey);
    const recipientDcAtaInfo = await connection.getAccountInfo(recipientDcAta);
    const ataRent = recipientDcAtaInfo ? 0 : RENT_COSTS.ATA;
    const requiredBalance = calculateRequiredBalance(txFees + jitoTipCost, ataRent);

    const ownerPubkey = new PublicKey(owner);
    const walletBalance = await connection.getBalance(ownerPubkey);
    if (walletBalance < requiredBalance) {
      throw errors.INSUFFICIENT_FUNDS({
        message: "Insufficient SOL balance to mint data credits",
        data: { required: requiredBalance, available: walletBalance },
      });
    }

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

    if (useJito) {
      const tipTx = await getJitoTipTransaction(ownerPubkey);
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
      actionMetadata: { type: "mint_data_credits", dcAmount: dcAmount || undefined, hntAmount: hntAmount || undefined, recipient: recipient || undefined },
    };
  }
);
