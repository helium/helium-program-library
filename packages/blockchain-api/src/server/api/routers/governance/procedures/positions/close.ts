import { publicProcedure } from "@/server/api/procedures";
import { createSolanaConnection } from "@/lib/solana";
import {
  generateTransactionTag,
  TRANSACTION_TYPES,
} from "@/lib/utils/transaction-tags";
import {
  buildVersionedTransaction,
  serializeTransaction,
} from "@/lib/utils/build-transaction";
import { init as initVsr, positionKey } from "@helium/voter-stake-registry-sdk";
import {
  createAssociatedTokenAccountIdempotentInstruction,
  getAssociatedTokenAddressSync,
  NATIVE_MINT,
} from "@solana/spl-token";
import { getTransactionFee } from "@/lib/utils/balance-validation";
import { toTokenAmountOutput } from "@/lib/utils/token-math";
import {
  PublicKey,
  SYSVAR_CLOCK_PUBKEY,
  TransactionInstruction,
} from "@solana/web3.js";
import BN from "bn.js";
import {
  requirePositionOwnership,
  getLockupKind,
  LockupKind,
} from "../helpers";

export const close = publicProcedure.governance.closePosition.handler(
  async ({ input, errors }) => {
    const { walletAddress, positionMint } = input;

    const { connection, provider } = createSolanaConnection(walletAddress);
    const walletPubkey = new PublicKey(walletAddress);
    const positionMintPubkey = new PublicKey(positionMint);

    const vsrProgram = await initVsr(provider);
    const [positionPubkey] = positionKey(positionMintPubkey);

    const positionAcc =
      await vsrProgram.account.positionV0.fetchNullable(positionPubkey);

    if (!positionAcc) {
      throw errors.NOT_FOUND({ message: "Position not found" });
    }

    await requirePositionOwnership(
      connection,
      positionMintPubkey,
      walletPubkey,
      errors,
    );

    if (positionAcc.numActiveVotes > 0) {
      throw errors.BAD_REQUEST({
        message: "Position has active votes and cannot be closed",
      });
    }

    const lockupKind = getLockupKind(positionAcc.lockup);
    const clock = await connection.getAccountInfo(SYSVAR_CLOCK_PUBKEY);
    const unixNow = Number(clock!.data.readBigInt64LE(8 * 4));

    if (
      lockupKind !== LockupKind.CONSTANT &&
      positionAcc.lockup.endTs.gt(new BN(unixNow))
    ) {
      throw errors.BAD_REQUEST({
        message: "Position lockup has not expired yet",
      });
    }

    const registrar = await vsrProgram.account.registrar.fetch(
      positionAcc.registrar,
    );
    const depositMint =
      registrar.votingMints[positionAcc.votingMintConfigIdx].mint;

    const instructions: TransactionInstruction[] = [];

    instructions.push(
      await vsrProgram.methods
        .withdrawV0({
          amount: positionAcc.amountDepositedNative,
        })
        .accountsPartial({
          position: positionPubkey,
          depositMint,
        })
        .instruction(),
    );

    instructions.push(
      createAssociatedTokenAccountIdempotentInstruction(
        walletPubkey,
        getAssociatedTokenAddressSync(depositMint, walletPubkey, true),
        walletPubkey,
        depositMint,
      ),
    );

    instructions.push(
      await vsrProgram.methods
        .closePositionV0()
        .accountsPartial({
          position: positionPubkey,
        })
        .instruction(),
    );

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
      type: TRANSACTION_TYPES.POSITION_CLOSE,
      walletAddress,
      positionMint,
    });

    return {
      transactionData: {
        transactions: [
          {
            serializedTransaction: serializeTransaction(tx),
            metadata: {
              type: "position_close",
              description: "Close staking position and withdraw funds",
              positionMint,
            },
          },
        ],
        parallel: false,
        tag,
        actionMetadata: { type: "position_close", positionMint },
      },
      estimatedSolFee: toTokenAmountOutput(
        new BN(txFee),
        NATIVE_MINT.toBase58(),
      ),
    };
  },
);
