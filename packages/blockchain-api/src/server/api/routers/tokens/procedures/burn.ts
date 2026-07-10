import { publicProcedure } from "../../../procedures";
import { PublicKey, TransactionInstruction } from "@solana/web3.js";
import {
  createBurnCheckedInstruction,
  getAssociatedTokenAddressSync,
  NATIVE_MINT,
} from "@solana/spl-token";
import { buildSingleTransactionResponse } from "@/lib/utils/build-transaction";
import {
  generateTransactionTag,
  TRANSACTION_TYPES,
} from "@/lib/utils/transaction-tags";
import {
  TOKEN_MINTS,
  TOKEN_NAMES,
  getTokenDecimals,
} from "@/lib/constants/tokens";
import { calculateRequiredBalance } from "@/lib/utils/balance-validation";
import { toTokenAmountOutput } from "@/lib/utils/token-math";
import {
  buildActionProposal,
  proposalTransactionData,
} from "../../squads/procedures/helpers";
import { createSolanaConnection } from "@/lib/solana";
import BN from "bn.js";

/** Burn `rawAmount` of `mint` from `authority`'s associated token account. */
async function buildBurnInstruction(
  authority: PublicKey,
  mint: string,
  rawAmount: bigint
): Promise<TransactionInstruction> {
  const mintKey = new PublicKey(mint);
  const senderAta = getAssociatedTokenAddressSync(mintKey, authority, true);
  const decimals = await getTokenDecimals(mint);
  return createBurnCheckedInstruction(
    senderAta,
    mintKey,
    authority,
    rawAmount,
    decimals
  );
}

export const burn = publicProcedure.tokens.burn.handler(
  async ({ input, errors }) => {
    const { walletAddress, tokenAmount } = input;

    const feePayer = new PublicKey(walletAddress);
    const { connection } = createSolanaConnection(walletAddress);

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

    const burnTokenAmount = await toTokenAmountOutput(
      new BN(tokenAmount.amount),
      tokenAmount.mint
    );
    const tokenName = TOKEN_NAMES[tokenAmount.mint];

    // ---- Squads propose mode: burn from the vault, wrapped as a proposal ----
    if (input.multisig) {
      const multisigPda = new PublicKey(input.multisig);
      const { serializedTransaction, transactionIndex, feeLamports } =
        await buildActionProposal({
          connection,
          multisigPda,
          member: feePayer,
          memo: input.memo,
          buildInstructions: async (vault) => [
            await buildBurnInstruction(vault, tokenAmount.mint, rawAmount),
          ],
          errors,
          action: "burn",
        });

      const tag = generateTransactionTag({
        type: TRANSACTION_TYPES.TOKEN_BURN,
        walletAddress,
        mint: tokenAmount.mint,
        amount: tokenAmount.amount,
        multisig: input.multisig,
      });

      return {
        transactionData: proposalTransactionData({
          serializedTransaction,
          type: TRANSACTION_TYPES.TOKEN_BURN_PROPOSAL,
          description: `Propose burn of ${tokenName ?? "Token"}`,
          tag,
          multisig: input.multisig,
          transactionIndex,
          metadata: { tokenAmount: burnTokenAmount, tokenName },
        }),
        estimatedSolFee: await toTokenAmountOutput(
          new BN(calculateRequiredBalance(feeLamports, 0)),
          NATIVE_MINT.toBase58()
        ),
      };
    }

    // ---- Direct burn from the wallet ----
    const instructions = [
      await buildBurnInstruction(feePayer, tokenAmount.mint, rawAmount),
    ];

    const tag = generateTransactionTag({
      type: TRANSACTION_TYPES.TOKEN_BURN,
      walletAddress,
      mint: tokenAmount.mint,
      amount: tokenAmount.amount,
    });

    return buildSingleTransactionResponse({
      connection,
      instructions,
      feePayer,
      addressLookupTableAddresses: [],
      insufficientFundsMessage: "Insufficient SOL balance for transaction fees",
      errors,
      tag,
      transactionMetadata: {
        type: "token_burn",
        description: `Burn ${tokenName ?? "Token"}`,
        tokenAmount: burnTokenAmount,
        tokenName,
      },
      actionMetadata: {
        type: "token_burn",
        tokenAmount: burnTokenAmount,
        tokenName,
      },
    });
  }
);
