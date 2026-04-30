import { publicProcedure } from "../../../procedures";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import {
  createAssociatedTokenAccountIdempotentInstruction,
  createTransferCheckedInstruction,
  getAssociatedTokenAddressSync,
  getMint,
  NATIVE_MINT,
} from "@solana/spl-token";
import { createSolanaConnection, getCluster } from "@/lib/solana";
import {
  generateTransactionTag,
  TRANSACTION_TYPES,
} from "@/lib/utils/transaction-tags";
import { TOKEN_MINTS, TOKEN_NAMES } from "@/lib/constants/tokens";
import {
  calculateRequiredBalance,
  getTotalTransactionFees,
  RENT_COSTS,
} from "@/lib/utils/balance-validation";
import { getJitoTipAmountLamports } from "@/lib/utils/jito";
import { toTokenAmountOutput } from "@/lib/utils/token-math";
import {
  buildBatchedTransactions,
  type InstructionGroup,
} from "../../governance/procedures/helpers/build-batched-transactions";
import BN from "bn.js";

export const multiTransfer = publicProcedure.tokens.multiTransfer.handler(
  async ({ input, errors }) => {
    const { walletAddress, mint, recipients } = input;

    const feePayer = new PublicKey(walletAddress);
    const { connection } = createSolanaConnection(walletAddress);

    const parsedAmounts = recipients.map((r) => {
      let raw: bigint;
      try {
        raw = BigInt(r.amount);
      } catch (e) {
        throw errors.BAD_REQUEST({
          message: `Invalid amount for ${r.destination}: ${
            e instanceof Error ? e.message : "could not parse amount"
          }`,
        });
      }
      if (raw <= BigInt(0)) {
        throw errors.BAD_REQUEST({
          message: `Amount for ${r.destination} must be greater than 0`,
        });
      }
      return raw;
    });

    const totalAmount = parsedAmounts.reduce(
      (sum, a) => sum + a,
      BigInt(0),
    );

    const tokenName = TOKEN_NAMES[mint];
    const isSol = mint === TOKEN_MINTS.WSOL;

    let groups: InstructionGroup[];
    let needsAtaCount = 0;

    if (isSol) {
      groups = recipients.map((r, i) => ({
        instructions: [
          SystemProgram.transfer({
            fromPubkey: feePayer,
            toPubkey: new PublicKey(r.destination),
            lamports: parsedAmounts[i],
          }),
        ],
        metadata: {
          type: "token_transfer",
          description: `Transfer ${tokenName ?? "Token"} to ${r.destination}`,
          recipient: r.destination,
          amount: r.amount,
          mint,
        },
      }));
    } else {
      const mintKey = new PublicKey(mint);
      const senderAta = getAssociatedTokenAddressSync(mintKey, feePayer, true);
      const destKeys = recipients.map((r) => new PublicKey(r.destination));
      const destAtas = destKeys.map((d) =>
        getAssociatedTokenAddressSync(mintKey, d, true),
      );

      const [mintInfo, destAtaInfos] = await Promise.all([
        getMint(connection, mintKey),
        connection.getMultipleAccountsInfo(destAtas),
      ]);

      needsAtaCount = destAtaInfos.filter((a) => !a).length;

      groups = recipients.map((r, i) => ({
        instructions: [
          createAssociatedTokenAccountIdempotentInstruction(
            feePayer,
            destAtas[i],
            destKeys[i],
            mintKey,
          ),
          createTransferCheckedInstruction(
            senderAta,
            mintKey,
            destAtas[i],
            feePayer,
            parsedAmounts[i],
            mintInfo.decimals,
          ),
        ],
        metadata: {
          type: "token_transfer",
          description: `Transfer ${tokenName ?? "Token"} to ${r.destination}`,
          recipient: r.destination,
          amount: r.amount,
          mint,
        },
      }));
    }

    const { transactions, versionedTransactions, hasMore } =
      await buildBatchedTransactions({
        groups,
        connection,
        feePayer,
      });

    if (hasMore) {
      throw errors.BAD_REQUEST({
        message:
          "Too many recipients to fit in a single Jito bundle. Split the call into smaller batches.",
      });
    }

    if (transactions.length === 0) {
      throw errors.BAD_REQUEST({
        message: "Could not pack any recipients into a transaction",
      });
    }

    const cluster = getCluster();
    const isMainnet = cluster === "mainnet" || cluster === "mainnet-beta";
    const jitoTipIncluded = isMainnet && versionedTransactions.length > 1;

    const txFee = getTotalTransactionFees(versionedTransactions);
    const jitoTipCost = jitoTipIncluded ? getJitoTipAmountLamports() : 0;
    const ataRent = needsAtaCount * RENT_COSTS.ATA;
    const tokenCost = isSol ? Number(totalAmount) : 0;
    const requiredBalance =
      calculateRequiredBalance(txFee, ataRent) + jitoTipCost + tokenCost;

    const walletBalance = await connection.getBalance(feePayer);
    if (walletBalance < requiredBalance) {
      throw errors.INSUFFICIENT_FUNDS({
        message: isSol
          ? "Insufficient SOL balance for transfers and transaction fees"
          : "Insufficient SOL balance for transaction fees",
        data: { required: requiredBalance, available: walletBalance },
      });
    }

    const tag = generateTransactionTag({
      type: TRANSACTION_TYPES.TOKEN_TRANSFER,
      walletAddress,
      mint,
      recipients: recipients.map((r) => ({
        destination: r.destination,
        amount: r.amount,
      })),
    });

    const totalAmountOutput = await toTokenAmountOutput(
      new BN(totalAmount.toString()),
      mint,
    );

    return {
      transactionData: {
        transactions,
        parallel: false,
        tag,
        actionMetadata: {
          type: "token_transfer",
          mint,
          tokenName,
          recipientCount: recipients.length,
          totalAmount: totalAmountOutput,
        },
      },
      estimatedSolFee: await toTokenAmountOutput(
        new BN(txFee + jitoTipCost + ataRent),
        NATIVE_MINT.toBase58(),
      ),
    };
  },
);
