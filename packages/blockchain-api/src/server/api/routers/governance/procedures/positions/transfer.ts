import { publicProcedure } from "@/server/api/procedures";
import { createSolanaConnection } from "@/lib/solana";
import { getTransactionFee } from "@/lib/utils/balance-validation";
import {
  generateTransactionTag,
  TRANSACTION_TYPES,
} from "@/lib/utils/transaction-tags";
import { toTokenAmountOutput } from "@/lib/utils/token-math";
import { TOKEN_NAMES } from "@/lib/constants/tokens";
import {
  buildVersionedTransaction,
  serializeTransaction,
} from "@/lib/utils/build-transaction";
import { init as initHsd } from "@helium/helium-sub-daos-sdk";
import { init as initVsr, positionKey } from "@helium/voter-stake-registry-sdk";
import { NATIVE_MINT } from "@solana/spl-token";
import { PublicKey, TransactionInstruction } from "@solana/web3.js";
import BN from "bn.js";
import {
  validatePositionOwnership,
  createTransferInstruction,
} from "../helpers";

export const transfer = publicProcedure.governance.transferPosition.handler(
  async ({ input, errors }) => {
    const { walletAddress, positionMint, targetPositionMint, amount } = input;

    const { connection, provider } = createSolanaConnection(walletAddress);
    const walletPubkey = new PublicKey(walletAddress);
    const sourcePositionMintPubkey = new PublicKey(positionMint);
    const targetPositionMintPubkey = new PublicKey(targetPositionMint);

    const vsrProgram = await initVsr(provider);
    const hsdProgram = await initHsd(provider);

    const [sourcePositionPubkey] = positionKey(sourcePositionMintPubkey);
    const [targetPositionPubkey] = positionKey(targetPositionMintPubkey);

    const [sourcePositionAcc, targetPositionAcc] = await Promise.all([
      vsrProgram.account.positionV0.fetchNullable(sourcePositionPubkey),
      vsrProgram.account.positionV0.fetchNullable(targetPositionPubkey),
    ]);

    if (!sourcePositionAcc) {
      throw errors.NOT_FOUND({ message: "Source position not found" });
    }
    if (!targetPositionAcc) {
      throw errors.NOT_FOUND({ message: "Target position not found" });
    }

    const [sourceOwnership, targetOwnership] = await Promise.all([
      validatePositionOwnership(
        connection,
        sourcePositionMintPubkey,
        walletPubkey,
      ),
      validatePositionOwnership(
        connection,
        targetPositionMintPubkey,
        walletPubkey,
      ),
    ]);

    if (!sourceOwnership.isOwner) {
      throw errors.BAD_REQUEST({
        message: "Wallet does not own the source position",
      });
    }
    if (!targetOwnership.isOwner) {
      throw errors.BAD_REQUEST({
        message: "Wallet does not own the target position",
      });
    }

    if (sourcePositionAcc.numActiveVotes > 0) {
      throw errors.BAD_REQUEST({
        message: "Source position has active votes and cannot transfer",
      });
    }
    if (targetPositionAcc.numActiveVotes > 0) {
      throw errors.BAD_REQUEST({
        message: "Target position has active votes and cannot receive transfer",
      });
    }

    const registrar = await vsrProgram.account.registrar.fetch(
      sourcePositionAcc.registrar,
    );
    const depositMint =
      registrar.votingMints[sourcePositionAcc.votingMintConfigIdx].mint;
    const depositMintStr = depositMint.toBase58();

    const amountBN = new BN(amount);

    if (amountBN.gt(sourcePositionAcc.amountDepositedNative)) {
      throw errors.BAD_REQUEST({
        message: "Transfer amount exceeds source position balance",
      });
    }

    const instructions: TransactionInstruction[] = [];

    instructions.push(
      await createTransferInstruction(
        connection,
        hsdProgram,
        vsrProgram,
        sourcePositionPubkey,
        targetPositionPubkey,
        depositMint,
        { amount: amountBN },
      ),
    );

    if (amountBN.eq(sourcePositionAcc.amountDepositedNative)) {
      instructions.push(
        await vsrProgram.methods
          .closePositionV0()
          .accountsPartial({
            position: sourcePositionPubkey,
          })
          .instruction(),
      );
    }

    const tx = await buildVersionedTransaction({
      connection,
      draft: { instructions, feePayer: walletPubkey },
    });

    const txFee = getTransactionFee(tx);

    const walletBalance = await connection.getBalance(walletPubkey);
    if (walletBalance < txFee) {
      throw errors.INSUFFICIENT_FUNDS({
        message: "Insufficient SOL balance for transaction fees",
        data: { required: txFee, available: walletBalance },
      });
    }

    const tag = generateTransactionTag({
      type: TRANSACTION_TYPES.POSITION_TRANSFER,
      walletAddress,
      positionMint,
      targetPositionMint,
      amount,
    });

    return {
      transactionData: {
        transactions: [
          {
            serializedTransaction: serializeTransaction(tx),
            metadata: {
              type: "position_transfer",
              description: "Transfer tokens between positions",
            },
          },
        ],
        parallel: false,
        tag,
        actionMetadata: {
          type: "position_transfer",
          positionMint,
          targetPositionMint,
          tokenAmount: toTokenAmountOutput(amountBN, depositMintStr),
          tokenName: TOKEN_NAMES[depositMintStr],
        },
      },
      estimatedSolFee: toTokenAmountOutput(
        new BN(txFee),
        NATIVE_MINT.toBase58(),
      ),
    };
  },
);
