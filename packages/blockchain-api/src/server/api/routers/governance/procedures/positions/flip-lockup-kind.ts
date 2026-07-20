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
import {
  PublicKey,
  SYSVAR_CLOCK_PUBKEY,
  TransactionInstruction,
} from "@solana/web3.js";
import { NATIVE_MINT } from "@solana/spl-token";
import BN from "bn.js";
import { getTransactionFee } from "@/lib/utils/balance-validation";
import { toTokenAmountOutput } from "@/lib/utils/token-math";
import {
  requirePositionOwnership,
  createResetLockupInstruction,
  getLockupKind,
  flipLockupKind as getFlippedLockupKind,
  toLockupKindArg,
  secsToDays,
  MAX_LOCKUP_PERIOD_IN_DAYS,
  LockupKind,
} from "../helpers";

export const flipLockupKind = publicProcedure.governance.flipLockupKind.handler(
  async ({ input, errors }) => {
    const { walletAddress, positionMint } = input;

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

    const lockupKind = getLockupKind(positionAcc.lockup);
    const isConstant = lockupKind === LockupKind.CONSTANT;
    const newLockupKind = getFlippedLockupKind(lockupKind);

    const clock = await connection.getAccountInfo(SYSVAR_CLOCK_PUBKEY);
    const unixNow = Number(clock!.data.readBigInt64LE(8 * 4));

    const registrar = await vsrProgram.account.registrar.fetch(
      positionAcc.registrar,
    );
    const depositMint =
      registrar.votingMints[positionAcc.votingMintConfigIdx].mint;

    const positionLockupPeriodInDays = Math.min(
      MAX_LOCKUP_PERIOD_IN_DAYS,
      Math.ceil(
        secsToDays(
          isConstant
            ? positionAcc.lockup.endTs
                .sub(positionAcc.lockup.startTs)
                .toNumber()
            : positionAcc.lockup.endTs.sub(new BN(unixNow)).toNumber(),
        ),
      ),
    );

    const instructions: TransactionInstruction[] = [];

    instructions.push(
      await createResetLockupInstruction(
        connection,
        hsdProgram,
        vsrProgram,
        positionPubkey,
        depositMint,
        {
          kind: toLockupKindArg(newLockupKind),
          periods: positionLockupPeriodInDays,
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
      type: TRANSACTION_TYPES.POSITION_FLIP_LOCKUP,
      walletAddress,
      positionMint,
    });

    return {
      transactionData: {
        transactions: [
          {
            serializedTransaction: serializeTransaction(tx),
            metadata: {
              type: "position_flip_lockup",
              description: `Change lockup from ${lockupKind} to ${newLockupKind}`,
            },
          },
        ],
        parallel: false,
        tag,
        actionMetadata: { type: "position_flip_lockup", positionMint },
      },
      estimatedSolFee: await toTokenAmountOutput(
        new BN(txFee),
        NATIVE_MINT.toBase58(),
      ),
    };
  },
);
