import { publicProcedure } from "../../../procedures";
import { PublicKey, Connection } from "@solana/web3.js";
import {
  createBurnCheckedInstruction,
  getAssociatedTokenAddressSync,
  getMint,
  NATIVE_MINT,
} from "@solana/spl-token";
import {
  buildVersionedTransaction,
  serializeTransaction,
} from "@/lib/utils/build-transaction";
import {
  generateTransactionTag,
  TRANSACTION_TYPES,
} from "@/lib/utils/transaction-tags";
import { TOKEN_MINTS, TOKEN_NAMES } from "@/lib/constants/tokens";
import {
  getTransactionFee,
  calculateRequiredBalance,
} from "@/lib/utils/balance-validation";
import { toTokenAmountOutput } from "@/lib/utils/token-math";
import BN from "bn.js";

export const burn = publicProcedure.tokens.burn.handler(
  async ({ input, errors }) => {
    const { walletAddress, tokenAmount } = input;

    const feePayer = new PublicKey(walletAddress);
    const connection = new Connection(process.env.SOLANA_RPC_URL!);

    let rawAmount: bigint;
    try {
      rawAmount = BigInt(tokenAmount.amount);
    } catch (e) {
      throw errors.BAD_REQUEST({
        message: `Invalid amount: ${
          e instanceof Error ? e.message : "could not parse amount"
        }`,
      });
    }
    if (rawAmount <= BigInt(0)) {
      throw errors.BAD_REQUEST({ message: "Amount must be greater than 0" });
    }
    // Burning native SOL is not a token burn; use a transfer to an incinerator
    // if that is ever needed.
    if (tokenAmount.mint === TOKEN_MINTS.WSOL) {
      throw errors.BAD_REQUEST({ message: "Cannot burn native SOL" });
    }

    const mintKey = new PublicKey(tokenAmount.mint);
    const senderAta = getAssociatedTokenAddressSync(mintKey, feePayer, true);
    const mintInfo = await getMint(connection, mintKey);

    const instructions = [
      createBurnCheckedInstruction(
        senderAta,
        mintKey,
        feePayer,
        rawAmount,
        mintInfo.decimals
      ),
    ];

    const tx = await buildVersionedTransaction({
      connection,
      draft: { instructions, feePayer, addressLookupTableAddresses: [] },
    });

    const tag = generateTransactionTag({
      type: TRANSACTION_TYPES.TOKEN_BURN,
      walletAddress,
      mint: tokenAmount.mint,
      amount: tokenAmount.amount,
    });

    const estimatedSolFeeLamports = calculateRequiredBalance(
      getTransactionFee(tx),
      0
    );
    const walletBalance = await connection.getBalance(feePayer);
    if (walletBalance < estimatedSolFeeLamports) {
      throw errors.INSUFFICIENT_FUNDS({
        message: "Insufficient SOL balance for transaction fees",
        data: { required: estimatedSolFeeLamports, available: walletBalance },
      });
    }

    const burnTokenAmount = await toTokenAmountOutput(
      new BN(tokenAmount.amount),
      tokenAmount.mint
    );
    const tokenName = TOKEN_NAMES[tokenAmount.mint];

    return {
      transactionData: {
        transactions: [
          {
            serializedTransaction: serializeTransaction(tx),
            metadata: {
              type: "token_burn",
              description: `Burn ${tokenName ?? "Token"}`,
              tokenAmount: burnTokenAmount,
              tokenName,
            },
          },
        ],
        parallel: false,
        tag,
        actionMetadata: {
          type: "token_burn",
          tokenAmount: burnTokenAmount,
          tokenName,
        },
      },
      estimatedSolFee: await toTokenAmountOutput(
        new BN(estimatedSolFeeLamports),
        NATIVE_MINT.toBase58()
      ),
    };
  }
);
