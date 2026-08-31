import { publicProcedure } from "../../../procedures";
import { PublicKey, Connection } from "@solana/web3.js";
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
  RENT_COSTS,
} from "@/lib/utils/balance-validation";
import { toTokenAmountOutput } from "@/lib/utils/token-math";
import { NATIVE_MINT } from "@solana/spl-token";
import {
  buildActionProposal,
  proposalTransactionData,
} from "../../squads/procedures/helpers";
import {
  buildTransferInstructions,
  transferSolShortfall,
} from "./transfer-helpers";
import BN from "bn.js";

export const transfer = publicProcedure.tokens.transfer.handler(
  async ({ input, errors }) => {
    const { walletAddress, destination, tokenAmount } = input;

    // A Squads action is built from the vault, and the proposing member already
    // pays the outer transaction's fee — both roles a fee payer could fill are
    // taken, so naming one can only mean the caller expects something else.
    if (input.feePayer && input.multisig) {
      throw errors.BAD_REQUEST({
        message: "feePayer is not supported with multisig",
      });
    }

    const authority = new PublicKey(walletAddress);
    const payer = input.feePayer ? new PublicKey(input.feePayer) : authority;
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
          member: authority,
          memo: input.memo,
          buildInstructions: async (vault) =>
            (
              await buildTransferInstructions({
                connection,
                authority: vault,
                payer: vault,
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
      authority,
      payer,
      destination: destKey,
      mint: tokenAmount.mint,
      rawAmount,
      isSol,
    });

    const tx = await buildVersionedTransaction({
      connection,
      draft: { instructions, feePayer: payer, addressLookupTableAddresses: [] },
    });

    const tag = generateTransactionTag({
      type: TRANSACTION_TYPES.TOKEN_TRANSFER,
      walletAddress,
      destination,
      mint: tokenAmount.mint,
      amount: tokenAmount.amount,
      feePayer: input.feePayer,
    });

    // For SOL transfers, no rent. For SPL, ATA rent if needed
    const rentCost = needsAta ? RENT_COSTS.ATA : 0;
    // A native SOL transfer's lamports leave the authority, so its balance is
    // its own check whenever a separate account pays the fee.
    const authorityPaysTransfer = isSol && !payer.equals(authority);
    const [txFee, payerBalance, authorityBalance] = await Promise.all([
      getTransactionFee(connection, tx),
      connection.getBalance(payer),
      authorityPaysTransfer ? connection.getBalance(authority) : null,
    ]);
    const estimatedSolFeeLamports = calculateRequiredBalance(txFee, rentCost);

    const shortfall = transferSolShortfall({
      payerBalance,
      payerLamports: estimatedSolFeeLamports,
      transferLamports: isSol ? Number(rawAmount) : 0,
      authorityBalance,
    });
    if (shortfall) {
      throw errors.INSUFFICIENT_FUNDS({
        message: shortfall.message,
        data: { required: shortfall.required, available: shortfall.available },
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
