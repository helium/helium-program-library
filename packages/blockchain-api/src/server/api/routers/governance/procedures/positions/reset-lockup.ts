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
import { init as initHsd } from "@helium/helium-sub-daos-sdk";
import { init as initVsr, positionKey } from "@helium/voter-stake-registry-sdk";
import { NATIVE_MINT } from "@solana/spl-token";
import { PublicKey, TransactionInstruction } from "@solana/web3.js";
import BN from "bn.js";
import { getTransactionFee } from "@/lib/utils/balance-validation";
import { toTokenAmountOutput } from "@/lib/utils/token-math";
import {
  requirePositionOwnership,
  createResetLockupInstruction,
  toLockupKindArg,
  LockupKindType,
} from "../helpers";

export const resetLockup = publicProcedure.governance.resetLockup.handler(
  async ({ input, errors }) => {
    const { walletAddress, positionMint, lockupKind, lockupPeriodsInDays } =
      input;

    const { connection, provider } = createSolanaConnection(walletAddress);
    const walletPubkey = new PublicKey(walletAddress);
    const positionMintPubkey = new PublicKey(positionMint);

    const vsrProgram = await initVsr(provider);
    const hsdProgram = await initHsd(provider);
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

    const registrar = await vsrProgram.account.registrar.fetch(
      positionAcc.registrar,
    );
    const depositMint =
      registrar.votingMints[positionAcc.votingMintConfigIdx].mint;

    const instructions: TransactionInstruction[] = [];

    instructions.push(
      await createResetLockupInstruction(
        connection,
        hsdProgram,
        vsrProgram,
        positionPubkey,
        depositMint,
        {
          kind: toLockupKindArg(lockupKind as LockupKindType),
          periods: lockupPeriodsInDays,
        },
      ),
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
      type: TRANSACTION_TYPES.POSITION_RESET_LOCKUP,
      walletAddress,
      positionMint,
      lockupKind,
      lockupPeriodsInDays,
    });

    return {
      transactionData: {
        transactions: [
          {
            serializedTransaction: serializeTransaction(tx),
            metadata: {
              type: "position_reset_lockup",
              description: `Reset lockup to ${lockupKind} for ${lockupPeriodsInDays} days`,
            },
          },
        ],
        parallel: false,
        tag,
      },
      estimatedSolFee: toTokenAmountOutput(
        new BN(txFee),
        NATIVE_MINT.toBase58(),
      ),
    };
  },
);
