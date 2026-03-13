import { publicProcedure } from "../../../procedures";
import { PublicKey, Connection } from "@solana/web3.js";
import {
  createAssociatedTokenAccountIdempotentInstruction,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import { HNT_MINT } from "@helium/spl-utils";
import {
  buildVersionedTransaction,
  serializeTransaction,
} from "@/lib/utils/build-transaction";
import {
  calculateRequiredBalance,
  getTransactionFee,
  BASE_TX_FEE_LAMPORTS,
  RENT_COSTS,
} from "@/lib/utils/balance-validation";
import { toTokenAmountOutput } from "@/lib/utils/token-math";
import { NATIVE_MINT } from "@solana/spl-token";
import BN from "bn.js";

/**
 * Create an HNT token account for a wallet.
 */
export const createHntAccount = publicProcedure.tokens.createHntAccount.handler(
  async ({ input, errors }) => {
    const { walletAddress } = input;

    if (!walletAddress) {
      throw errors.INVALID_WALLET_ADDRESS();
    }

    const wallet = new PublicKey(walletAddress);

    // Get the associated token account address for HNT
    const hntTokenAccount = getAssociatedTokenAddressSync(
      HNT_MINT,
      wallet,
      true, // allowOwnerOffCurve
    );

    // Check wallet has sufficient balance
    const connection = new Connection(process.env.SOLANA_RPC_URL!);
    const ataExists = await connection.getAccountInfo(hntTokenAccount);
    const rentCost = ataExists ? 0 : RENT_COSTS.ATA;
    const walletBalance = await connection.getBalance(wallet);
    const required = calculateRequiredBalance(BASE_TX_FEE_LAMPORTS, rentCost);

    if (walletBalance < required) {
      throw errors.INSUFFICIENT_FUNDS({
        message: "Insufficient SOL balance to create HNT token account",
        data: { required, available: walletBalance },
      });
    }

    // Create instruction to create the associated token account
    const createAccountInstruction =
      createAssociatedTokenAccountIdempotentInstruction(
        wallet, // payer
        hntTokenAccount, // associated token account
        wallet, // owner
        HNT_MINT, // mint
      );

    const tx = await buildVersionedTransaction({
      connection,
      draft: {
        instructions: [createAccountInstruction],
        feePayer: wallet,
        addressLookupTableAddresses: [],
      },
    });

    const txFee = getTransactionFee(tx);
    const estimatedSolFeeLamports = txFee + rentCost;

    return {
      transactionData: {
        transactions: [
          {
            serializedTransaction: serializeTransaction(tx),
            metadata: {
              type: "hnt-token-account",
              description: "Create HNT token account",
            },
          },
        ],
        parallel: false,
      },
      estimatedSolFee: toTokenAmountOutput(
        new BN(estimatedSolFeeLamports),
        NATIVE_MINT.toBase58(),
      ),
    };
  },
);
