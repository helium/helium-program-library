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
import {
  PublicKey,
  SYSVAR_CLOCK_PUBKEY,
  TransactionInstruction,
} from "@solana/web3.js";
import BN from "bn.js";
import {
  validatePositionOwnership,
  createTransferInstruction,
} from "../helpers";

interface LockupLike {
  startTs: BN;
  endTs: BN;
  kind: object;
}

function rawLockupKind(lockup: LockupLike): string {
  return Object.keys(lockup.kind)[0];
}

function lockupStrictness(lockup: LockupLike): number {
  return rawLockupKind(lockup) === "none" ? 0 : 1;
}

function lockupSecondsLeft(lockup: LockupLike, unixNow: BN): BN {
  const currTs =
    rawLockupKind(lockup) === "constant" ? lockup.startTs : unixNow;
  return currTs.gte(lockup.endTs) ? new BN(0) : lockup.endTs.sub(currTs);
}

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

    const sourceOwnership = await validatePositionOwnership(
      connection,
      sourcePositionMintPubkey,
      walletPubkey
    );

    if (!sourceOwnership.isOwner) {
      throw errors.BAD_REQUEST({
        message: "Wallet does not own the source position",
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

    if (!targetPositionAcc.registrar.equals(sourcePositionAcc.registrar)) {
      throw errors.BAD_REQUEST({
        message: "Target position belongs to a different registrar",
      });
    }
    if (
      targetPositionAcc.votingMintConfigIdx !==
      sourcePositionAcc.votingMintConfigIdx
    ) {
      throw errors.BAD_REQUEST({
        message: "Target position uses a different voting mint configuration",
      });
    }

    const clockInfo = await connection.getAccountInfo(SYSVAR_CLOCK_PUBKEY);
    const unixNow = new BN(Number(clockInfo!.data.readBigInt64LE(8 * 4)));

    if (
      lockupSecondsLeft(targetPositionAcc.lockup, unixNow).lt(
        lockupSecondsLeft(sourcePositionAcc.lockup, unixNow)
      )
    ) {
      throw errors.BAD_REQUEST({
        message:
          "Target position lockup must be equal-or-longer than the source's",
      });
    }
    if (
      lockupStrictness(targetPositionAcc.lockup) <
      lockupStrictness(sourcePositionAcc.lockup)
    ) {
      throw errors.BAD_REQUEST({
        message:
          "Target position lockup kind must be equal-or-stricter than the source's",
      });
    }

    const registrar = await vsrProgram.account.registrar.fetch(
      sourcePositionAcc.registrar
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
        { amount: amountBN }
      )
    );

    if (amountBN.eq(sourcePositionAcc.amountDepositedNative)) {
      instructions.push(
        await vsrProgram.methods
          .closePositionV0()
          .accountsPartial({
            position: sourcePositionPubkey,
          })
          .instruction()
      );
    }

    const tx = await buildVersionedTransaction({
      connection,
      draft: { instructions, feePayer: walletPubkey },
    });

    const txFee = await getTransactionFee(connection, tx);

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
          tokenAmount: await toTokenAmountOutput(amountBN, depositMintStr),
          tokenName: TOKEN_NAMES[depositMintStr],
        },
      },
      estimatedSolFee: await toTokenAmountOutput(
        new BN(txFee),
        NATIVE_MINT.toBase58()
      ),
    };
  }
);
