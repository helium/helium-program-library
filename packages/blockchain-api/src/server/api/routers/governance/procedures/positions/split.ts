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
  MintLayout,
  TOKEN_PROGRAM_ID,
  createInitializeMintInstruction,
} from "@solana/spl-token";
import {
  Keypair,
  PublicKey,
  SystemProgram,
  TransactionInstruction,
} from "@solana/web3.js";
import BN from "bn.js";
import { getTransactionFee } from "@/lib/utils/balance-validation";
import { toTokenAmountOutput } from "@/lib/utils/token-math";
import { NATIVE_MINT } from "@solana/spl-token";
import {
  requirePositionOwnership,
  createTransferInstruction,
  toLockupKindArg,
  LockupKindType,
} from "../helpers";

export const split = publicProcedure.governance.splitPosition.handler(
  async ({ input, errors }) => {
    const {
      walletAddress,
      positionMint,
      amount,
      lockupKind,
      lockupPeriodsInDays,
    } = input;

    const { connection, provider } = createSolanaConnection(walletAddress);
    const walletPubkey = new PublicKey(walletAddress);
    const sourcePositionMintPubkey = new PublicKey(positionMint);

    const vsrProgram = await initVsr(provider);
    const hsdProgram = await initHsd(provider);
    const [sourcePositionPubkey] = positionKey(sourcePositionMintPubkey);

    const sourcePositionAcc =
      await vsrProgram.account.positionV0.fetchNullable(sourcePositionPubkey);

    if (!sourcePositionAcc) {
      throw errors.NOT_FOUND({ message: "Source position not found" });
    }

    await requirePositionOwnership(
      connection,
      sourcePositionMintPubkey,
      walletPubkey,
      errors,
    );

    const registrar = await vsrProgram.account.registrar.fetch(
      sourcePositionAcc.registrar,
    );
    const depositMint =
      registrar.votingMints[sourcePositionAcc.votingMintConfigIdx].mint;

    const amountBN = new BN(amount);

    if (amountBN.lte(new BN(0))) {
      throw errors.BAD_REQUEST({
        message: "Split amount must be greater than 0",
      });
    }

    if (amountBN.gt(sourcePositionAcc.amountDepositedNative)) {
      throw errors.BAD_REQUEST({
        message: "Split amount exceeds position balance",
      });
    }

    const newMintKeypair = Keypair.generate();
    const [targetPositionPubkey] = positionKey(newMintKeypair.publicKey);

    const mintRent = await connection.getMinimumBalanceForRentExemption(
      MintLayout.span,
    );

    const instructions: TransactionInstruction[] = [];

    instructions.push(
      SystemProgram.createAccount({
        fromPubkey: walletPubkey,
        newAccountPubkey: newMintKeypair.publicKey,
        lamports: mintRent,
        space: MintLayout.span,
        programId: TOKEN_PROGRAM_ID,
      }),
    );

    instructions.push(
      createInitializeMintInstruction(
        newMintKeypair.publicKey,
        0,
        targetPositionPubkey,
        targetPositionPubkey,
      ),
    );

    instructions.push(
      await vsrProgram.methods
        .initializePositionV0({
          kind: toLockupKindArg(lockupKind as LockupKindType) as Parameters<
            typeof vsrProgram.methods.initializePositionV0
          >[0]["kind"],
          periods: lockupPeriodsInDays,
        })
        .accountsPartial({
          registrar: sourcePositionAcc.registrar,
          mint: newMintKeypair.publicKey,
          depositMint,
          recipient: walletPubkey,
        })
        .instruction(),
    );

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
      signers: [newMintKeypair],
    });

    const tag = generateTransactionTag({
      type: TRANSACTION_TYPES.POSITION_SPLIT,
      walletAddress,
      positionMint,
      amount,
    });

    const txFee = getTransactionFee(tx);
    const estimatedSolFeeLamports = txFee + mintRent;

    const walletBalance = await connection.getBalance(walletPubkey);
    if (walletBalance < estimatedSolFeeLamports) {
      throw errors.INSUFFICIENT_FUNDS({
        message: "Insufficient SOL balance to split position",
        data: { required: estimatedSolFeeLamports, available: walletBalance },
      });
    }

    return {
      transactionData: {
        transactions: [
          {
            serializedTransaction: serializeTransaction(tx),
            metadata: {
              type: "position_split",
              description: `Split position into new ${lockupKind} lockup`,
              newPositionMint: newMintKeypair.publicKey.toBase58(),
            },
          },
        ],
        parallel: false,
        tag,
      },
      estimatedSolFee: toTokenAmountOutput(
        new BN(estimatedSolFeeLamports),
        NATIVE_MINT.toBase58(),
      ),
    };
  },
);
