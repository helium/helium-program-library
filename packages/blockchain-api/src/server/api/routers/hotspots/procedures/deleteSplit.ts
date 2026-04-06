import { publicProcedure } from "../../../procedures";
import { connectToDb } from "@/lib/utils/db";
import { AssetOwner } from "@/lib/models/hotspot";
import { MiniFanout } from "@/lib/models/mini-fanout";
import { Recipient } from "@/lib/models/recipient";
import { createSolanaConnection } from "@/lib/solana";
import {
  getAssetIdFromPubkey,
  resolveHotspotName,
} from "@/lib/utils/hotspot-helpers";
import {
  init as initLd,
  updateCompressionDestination,
} from "@helium/lazy-distributor-sdk";
import { init as initMiniFanout } from "@helium/mini-fanout-sdk";
import { init as initTuktuk } from "@helium/tuktuk-sdk";
import { PublicKey } from "@solana/web3.js";
import {
  buildVersionedTransaction,
  serializeTransaction,
} from "@/lib/utils/build-transaction";
import {
  generateTransactionTag,
  TRANSACTION_TYPES,
} from "@/lib/utils/transaction-tags";
import {
  calculateRequiredBalance,
  getTransactionFee,
  BASE_TX_FEE_LAMPORTS,
} from "@/lib/utils/balance-validation";
import { toTokenAmountOutput } from "@/lib/utils/token-math";
import { NATIVE_MINT } from "@solana/spl-token";
import BN from "bn.js";

/**
 * Remove the split configuration from a hotspot.
 */
export const deleteSplit = publicProcedure.hotspots.deleteSplit.handler(
  async ({ input, errors }) => {
    const { walletAddress, hotspotPubkey } = input;

    await connectToDb();

    // Resolve hotspot pubkey to asset ID
    const assetId = await getAssetIdFromPubkey(hotspotPubkey);
    if (!assetId) {
      throw errors.NOT_FOUND({ message: "Hotspot not found" });
    }

    const hotspotNameP = resolveHotspotName(assetId);

    // Find the hotspot
    const assetOwner = await AssetOwner.findOne({
      where: { asset: assetId },
      include: [
        {
          model: Recipient,
          as: "recipient",
          required: true,
          include: [
            {
              model: MiniFanout,
              as: "split",
              required: true,
            },
          ],
        },
      ],
    });

    if (!assetOwner) {
      throw errors.NOT_FOUND({ message: "Hotspot not found" });
    }

    if (!assetOwner.recipient?.split) {
      throw errors.NOT_FOUND({ message: "Hotspot does not have a split" });
    }

    const { provider, connection } = createSolanaConnection(walletAddress);
    const program = await initMiniFanout(provider);
    const miniFanoutK = new PublicKey(assetOwner.recipient.split.address);
    const miniFanout =
      await program.account.miniFanoutV0.fetchNullable(miniFanoutK);

    if (!miniFanout) {
      throw errors.NOT_FOUND({ message: "Fanout not found" });
    }

    // Check wallet has sufficient balance for transaction fees
    const walletBalance = await connection.getBalance(
      new PublicKey(walletAddress),
    );
    const required = calculateRequiredBalance(BASE_TX_FEE_LAMPORTS, 0);
    if (walletBalance < required) {
      throw errors.INSUFFICIENT_FUNDS({
        message: "Insufficient SOL balance for transaction fees",
        data: { required, available: walletBalance },
      });
    }

    const tuktukProgram = await initTuktuk(provider);

    // Create the transaction to remove the mini fanout
    const task = miniFanout.nextTask.equals(miniFanoutK)
      ? null
      : await tuktukProgram.account.taskV0.fetchNullable(miniFanout.nextTask);

    const closeIx = await program.methods
      .closeMiniFanoutV0()
      .accounts({
        miniFanout: miniFanoutK,
        taskRentRefund: task?.rentRefund || walletAddress,
      })
      .instruction();

    const ldProgram = await initLd(provider);
    const setRecipientIx = await (
      await updateCompressionDestination({
        program: ldProgram,
        assetId: new PublicKey(assetId),
        lazyDistributor: new PublicKey(assetOwner.recipient.lazyDistributor),
        destination: null,
      })
    ).instruction();

    const tx = await buildVersionedTransaction({
      connection,
      draft: {
        instructions: [closeIx, setRecipientIx],
        feePayer: new PublicKey(walletAddress),
      },
    });

    const tag = generateTransactionTag({
      type: TRANSACTION_TYPES.REMOVE_SPLIT,
      walletAddress,
      assetId,
    });

    const txFee = getTransactionFee(tx);

    return {
      transactionData: {
        transactions: [
          {
            serializedTransaction: serializeTransaction(tx),
            metadata: {
              type: "remove_split",
              description: "Remove split",
              hotspotKey: assetId,
            },
          },
        ],
        parallel: true,
        tag,
        actionMetadata: {
          type: "remove_split",
          hotspotKey: assetId,
          hotspotName: await hotspotNameP,
        },
      },
      estimatedSolFee: toTokenAmountOutput(
        new BN(txFee),
        NATIVE_MINT.toBase58(),
      ),
    };
  },
);
