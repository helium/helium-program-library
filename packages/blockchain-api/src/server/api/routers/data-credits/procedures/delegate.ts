import { publicProcedure } from "../../../procedures";
import { PublicKey, TransactionInstruction } from "@solana/web3.js";
import { createSolanaConnection } from "@/lib/solana";
import { init as initDc } from "@helium/data-credits-sdk";
import { subDaoKey } from "@helium/helium-sub-daos-sdk";
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

const MEMO_PROGRAM_ID = new PublicKey(
  "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr",
);

export const delegate = publicProcedure.dataCredits.delegate.handler(
  async ({ input, errors }) => {
    const { owner, routerKey, amount, mint, memo } = input;

    const { provider, connection } = createSolanaConnection(owner);
    const feePayer = new PublicKey(owner);
    const program = await initDc(provider);
    const subDao = subDaoKey(new PublicKey(mint))[0];

    const instructions: TransactionInstruction[] = [];

    if (memo) {
      instructions.push(
        new TransactionInstruction({
          keys: [{ pubkey: feePayer, isSigner: true, isWritable: false }],
          programId: MEMO_PROGRAM_ID,
          data: Buffer.from(memo, "utf-8"),
        }),
      );
    }

    instructions.push(
      await program.methods
        .delegateDataCreditsV0({
          amount: new BN(amount),
          routerKey,
        })
        .accountsPartial({
          subDao,
        })
        .instruction(),
    );

    const tx = await buildVersionedTransaction({
      connection,
      draft: {
        instructions,
        feePayer,
      },
    });

    const txFee = getTransactionFee(tx);
    const walletBalance = await connection.getBalance(feePayer);
    if (walletBalance < txFee) {
      throw errors.INSUFFICIENT_FUNDS({
        message: "Insufficient SOL balance to delegate data credits",
        data: { required: txFee, available: walletBalance },
      });
    }

    const tag = generateTransactionTag({
      type: TRANSACTION_TYPES.DELEGATE_DATA_CREDITS,
      userAddress: owner,
      routerKey,
      amount,
      mint,
    });

    return {
      transactions: [
        {
          serializedTransaction: serializeTransaction(tx),
          metadata: {
            type: "delegate_data_credits",
            description: `Delegate ${amount} DC to router ${routerKey.substring(0, 8)}...`,
          },
        },
      ],
      parallel: false,
      tag,
      actionMetadata: {
        type: "delegate_data_credits",
        routerKey,
        amount,
        mint,
      },
    };
  },
);
