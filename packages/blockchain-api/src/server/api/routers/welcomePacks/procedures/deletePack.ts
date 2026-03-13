import { publicProcedure } from "../../../procedures";
import { env } from "@/lib/env";
import { createSolanaConnection } from "@/lib/solana";
import {
  calculateRequiredBalance,
  getTransactionFee,
  BASE_TX_FEE_LAMPORTS,
} from "@/lib/utils/balance-validation";
import {
  buildVersionedTransaction,
  serializeTransaction,
} from "@/lib/utils/build-transaction";
import {
  generateTransactionTag,
  TRANSACTION_TYPES,
} from "@/lib/utils/transaction-tags";
import { getAsset, getAssetProof } from "@helium/spl-utils";
import {
  closeWelcomePack,
  init,
  welcomePackKey,
} from "@helium/welcome-pack-sdk";
import { PublicKey } from "@solana/web3.js";
import { toTokenAmountOutput } from "@/lib/utils/token-math";
import BN from "bn.js";
import { NATIVE_MINT } from "@solana/spl-token";

/**
 * Delete a welcome pack.
 */
export const deletePack = publicProcedure.welcomePacks.delete.handler(
  async ({ input, errors }) => {
    const { walletAddress, packId } = input;

    if (!walletAddress) {
      throw errors.INVALID_WALLET_ADDRESS();
    }

    if (!packId) {
      throw errors.BAD_REQUEST({ message: "Pack ID is required" });
    }

    const { provider } = createSolanaConnection(walletAddress);
    const program = await init(provider);

    const welcomePackK = welcomePackKey(
      new PublicKey(walletAddress),
      Number(packId),
    )[0];

    // Check wallet has sufficient balance for transaction fees
    const walletBalance = await provider.connection.getBalance(
      new PublicKey(walletAddress),
    );
    const required = calculateRequiredBalance(BASE_TX_FEE_LAMPORTS, 0);
    if (walletBalance < required) {
      throw errors.INSUFFICIENT_FUNDS({
        message: "Insufficient SOL balance for transaction fees",
        data: { required, available: walletBalance },
      });
    }

    const { instruction: ix } = await (
      await closeWelcomePack({
        program,
        welcomePack: welcomePackK,
        getAssetFn: (_, assetId) =>
          getAsset(
            env.ASSET_ENDPOINT || program.provider.connection.rpcEndpoint,
            assetId,
          ),
        getAssetProofFn: (_, assetId) =>
          getAssetProof(
            env.ASSET_ENDPOINT || program.provider.connection.rpcEndpoint,
            assetId,
          ),
      })
    ).prepare();

    const tx = await buildVersionedTransaction({
      connection: provider.connection,
      draft: {
        instructions: [ix],
        feePayer: new PublicKey(walletAddress),
      },
    });

    const tag = generateTransactionTag({
      type: TRANSACTION_TYPES.WELCOME_PACK_DELETE,
      walletAddress,
      packId,
    });

    const txFee = getTransactionFee(tx);

    return {
      transactionData: {
        transactions: [
          {
            serializedTransaction: serializeTransaction(tx),
            metadata: {
              type: "welcome_pack_delete",
              description: "Delete welcome pack",
            },
          },
        ],
        parallel: true,
        tag,
      },
      estimatedSolFee: toTokenAmountOutput(
        new BN(txFee),
        NATIVE_MINT.toBase58(),
      ),
    };
  },
);
