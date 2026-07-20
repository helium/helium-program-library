import { publicProcedure } from "@/server/api/procedures";
import { createSolanaConnection } from "@/lib/solana";
import { getTransactionFee } from "@/lib/utils/balance-validation";
import {
  generateTransactionTag,
  TRANSACTION_TYPES,
} from "@/lib/utils/transaction-tags";
import { toTokenAmountOutput } from "@/lib/utils/token-math";
import {
  buildVersionedTransaction,
  serializeTransaction,
} from "@/lib/utils/build-transaction";
import { init as initVsr, positionKey } from "@helium/voter-stake-registry-sdk";
import { NATIVE_MINT } from "@solana/spl-token";
import { PublicKey } from "@solana/web3.js";
import BN from "bn.js";
import { validatePositionOwnership } from "../helpers";

export const transferOwnership =
  publicProcedure.governance.transferPositionOwnership.handler(
    async ({ input, errors }) => {
      const { from, to, positionMint } = input;

      const { connection, provider } = createSolanaConnection(from);
      const fromPubkey = new PublicKey(from);
      const toPubkey = new PublicKey(to);
      const positionMintPubkey = new PublicKey(positionMint);

      const vsrProgram = await initVsr(provider);

      const [positionPubkey] = positionKey(positionMintPubkey);
      const positionAcc =
        await vsrProgram.account.positionV0.fetchNullable(positionPubkey);

      if (!positionAcc) {
        throw errors.NOT_FOUND({ message: "Position not found" });
      }

      const ownership = await validatePositionOwnership(
        connection,
        positionMintPubkey,
        fromPubkey,
      );

      if (!ownership.isOwner) {
        throw errors.BAD_REQUEST({
          message: "From wallet does not own the position",
        });
      }

      const ix = await vsrProgram.methods
        .transferPositionV0()
        .accountsPartial({
          payer: fromPubkey,
          position: positionPubkey,
          mint: positionMintPubkey,
          from: fromPubkey,
          to: toPubkey,
        })
        .instruction();

      const tx = await buildVersionedTransaction({
        connection,
        draft: { instructions: [ix], feePayer: fromPubkey },
      });

      const txFee = getTransactionFee(tx);

      const walletBalance = await connection.getBalance(fromPubkey);
      if (walletBalance < txFee) {
        throw errors.INSUFFICIENT_FUNDS({
          message: "Insufficient SOL balance for transaction fees",
          data: { required: txFee, available: walletBalance },
        });
      }

      const tag = generateTransactionTag({
        type: TRANSACTION_TYPES.POSITION_TRANSFER_OWNERSHIP,
        from,
        to,
        positionMint,
      });

      return {
        transactionData: {
          transactions: [
            {
              serializedTransaction: serializeTransaction(tx),
              metadata: {
                type: "position_transfer_ownership",
                description: "Transfer position ownership to another wallet",
              },
            },
          ],
          parallel: false,
          tag,
          actionMetadata: { type: "position_transfer_ownership", positionMint, from, to },
        },
        estimatedSolFee: await toTokenAmountOutput(
          new BN(txFee),
          NATIVE_MINT.toBase58(),
        ),
      };
    },
  );
