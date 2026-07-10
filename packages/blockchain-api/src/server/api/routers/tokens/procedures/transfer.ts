import { publicProcedure } from "../../../procedures";
import {
  PublicKey,
  SystemProgram,
  Connection,
  TransactionInstruction,
} from "@solana/web3.js";
import {
  createAssociatedTokenAccountIdempotentInstruction,
  createTransferCheckedInstruction,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import {
  buildVersionedTransaction,
  serializeTransaction,
} from "@/lib/utils/build-transaction";
import {
  generateTransactionTag,
  TRANSACTION_TYPES,
} from "@/lib/utils/transaction-tags";
import {
  TOKEN_MINTS,
  TOKEN_NAMES,
  getTokenDecimals,
} from "@/lib/constants/tokens";
import {
  getTransactionFee,
  calculateRequiredBalance,
  RENT_COSTS,
} from "@/lib/utils/balance-validation";
import { toTokenAmountOutput } from "@/lib/utils/token-math";
import { NATIVE_MINT } from "@solana/spl-token";
import {
  buildActionProposal,
  proposalTransactionData,
} from "../../squads/procedures/helpers";
import BN from "bn.js";

/**
 * Build the raw transfer instructions with `authority` as the source owner and
 * fee payer for any created associated token account. Shared by the direct
 * transfer path (authority = wallet) and the Squads propose path (authority =
 * vault).
 */
async function buildTransferInstructions({
  connection,
  authority,
  destination,
  mint,
  rawAmount,
  isSol,
}: {
  connection: Connection;
  authority: PublicKey;
  destination: PublicKey;
  mint: string;
  rawAmount: bigint;
  isSol: boolean;
}): Promise<{ instructions: TransactionInstruction[]; needsAta: boolean }> {
  if (isSol) {
    return {
      instructions: [
        SystemProgram.transfer({
          fromPubkey: authority,
          toPubkey: destination,
          lamports: rawAmount,
        }),
      ],
      needsAta: false,
    };
  }

  const mintKey = new PublicKey(mint);
  const senderAta = getAssociatedTokenAddressSync(mintKey, authority, true);
  const destAta = getAssociatedTokenAddressSync(mintKey, destination, true);
  const [destAtaInfo, decimals] = await Promise.all([
    connection.getAccountInfo(destAta),
    getTokenDecimals(mint),
  ]);
  const needsAta = !destAtaInfo;

  return {
    instructions: [
      createAssociatedTokenAccountIdempotentInstruction(
        authority,
        destAta,
        destination,
        mintKey
      ),
      createTransferCheckedInstruction(
        senderAta,
        mintKey,
        destAta,
        authority,
        rawAmount,
        decimals
      ),
    ],
    needsAta,
  };
}

export const transfer = publicProcedure.tokens.transfer.handler(
  async ({ input, errors }) => {
    const { walletAddress, destination, tokenAmount } = input;

    const feePayer = new PublicKey(walletAddress);
    const destKey = new PublicKey(destination);
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

    const isSol = tokenAmount.mint === TOKEN_MINTS.WSOL;
    const transferTokenAmount = await toTokenAmountOutput(
      new BN(tokenAmount.amount),
      tokenAmount.mint
    );
    const tokenName = TOKEN_NAMES[tokenAmount.mint];

    // ---- Squads propose mode: build the transfer from the vault, wrap it ----
    if (input.multisig) {
      const multisigPda = new PublicKey(input.multisig);
      const { serializedTransaction, transactionIndex, feeLamports } =
        await buildActionProposal({
          connection,
          multisigPda,
          member: feePayer,
          memo: input.memo,
          buildInstructions: async (vault) =>
            (
              await buildTransferInstructions({
                connection,
                authority: vault,
                destination: destKey,
                mint: tokenAmount.mint,
                rawAmount,
                isSol,
              })
            ).instructions,
          errors,
          action: "transfer",
        });

      const tag = generateTransactionTag({
        type: TRANSACTION_TYPES.TOKEN_TRANSFER,
        walletAddress,
        destination,
        mint: tokenAmount.mint,
        amount: tokenAmount.amount,
        multisig: input.multisig,
      });

      return {
        transactionData: proposalTransactionData({
          serializedTransaction,
          type: TRANSACTION_TYPES.TOKEN_TRANSFER_PROPOSAL,
          description: `Propose transfer of ${tokenName ?? "Token"}`,
          tag,
          multisig: input.multisig,
          transactionIndex,
          metadata: {
            tokenAmount: transferTokenAmount,
            tokenName,
            recipient: destination,
          },
        }),
        estimatedSolFee: await toTokenAmountOutput(
          new BN(calculateRequiredBalance(feeLamports, 0)),
          NATIVE_MINT.toBase58()
        ),
      };
    }

    // ---- Direct transfer from the wallet ----
    const { instructions, needsAta } = await buildTransferInstructions({
      connection,
      authority: feePayer,
      destination: destKey,
      mint: tokenAmount.mint,
      rawAmount,
      isSol,
    });

    const tx = await buildVersionedTransaction({
      connection,
      draft: { instructions, feePayer, addressLookupTableAddresses: [] },
    });

    const tag = generateTransactionTag({
      type: TRANSACTION_TYPES.TOKEN_TRANSFER,
      walletAddress,
      destination,
      mint: tokenAmount.mint,
      amount: tokenAmount.amount,
    });

    // For SOL transfers, no rent. For SPL, ATA rent if needed
    const rentCost = needsAta ? RENT_COSTS.ATA : 0;
    const txFee = getTransactionFee(tx);
    const estimatedSolFeeLamports = calculateRequiredBalance(txFee, rentCost);

    const walletBalance = await connection.getBalance(feePayer);
    const totalCost = isSol
      ? Number(rawAmount) + estimatedSolFeeLamports
      : estimatedSolFeeLamports;
    if (walletBalance < totalCost) {
      throw errors.INSUFFICIENT_FUNDS({
        message: isSol
          ? "Insufficient SOL balance for transfer and transaction fees"
          : "Insufficient SOL balance for transaction fees",
        data: { required: totalCost, available: walletBalance },
      });
    }

    return {
      transactionData: {
        transactions: [
          {
            serializedTransaction: serializeTransaction(tx),
            metadata: {
              type: "token_transfer",
              description: `Transfer ${tokenName ?? "Token"}`,
              tokenAmount: transferTokenAmount,
              tokenName,
              recipient: destination,
            },
          },
        ],
        parallel: false,
        tag,
        actionMetadata: {
          type: "token_transfer",
          tokenAmount: transferTokenAmount,
          tokenName,
          recipient: destination,
        },
      },
      estimatedSolFee: await toTokenAmountOutput(
        new BN(estimatedSolFeeLamports),
        NATIVE_MINT.toBase58()
      ),
    };
  }
);
