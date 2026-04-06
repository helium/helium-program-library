import { publicProcedure } from "../../../procedures";
import { env } from "@/lib/env";
import { createSolanaConnection, loadKeypair } from "@/lib/solana";
import {
  buildVersionedTransaction,
  serializeTransaction,
} from "@/lib/utils/build-transaction";
import {
  generateTransactionTag,
  TRANSACTION_TYPES,
} from "@/lib/utils/transaction-tags";
import { getAsset, getAssetProof } from "@helium/spl-utils";
import { init as initTuktuk } from "@helium/tuktuk-sdk";
import { claimWelcomePack, init } from "@helium/welcome-pack-sdk";
import {
  createAssociatedTokenAccountIdempotentInstruction,
  getAssociatedTokenAddressSync,
  NATIVE_MINT,
} from "@solana/spl-token";
import { PublicKey } from "@solana/web3.js";
import BN from "bn.js";
import { toTokenAmountOutput } from "@/lib/utils/token-math";

/**
 * Claim a welcome pack.
 */
export const claim = publicProcedure.welcomePacks.claim.handler(
  async ({ input, errors }) => {
    const { packAddress, walletAddress, signature, expirationTs } = input;

    if (!packAddress || !walletAddress) {
      throw errors.BAD_REQUEST({
        message: "Pack address and wallet address are required",
      });
    }

    // Verify expiration
    const currentTs = Math.floor(Date.now() / 1000);
    if (currentTs > parseInt(expirationTs)) {
      throw errors.EXPIRED({ message: "Invite has expired" });
    }

    const signatureBytes = Buffer.from(signature, "base64");

    const feePayerWallet = loadKeypair(process.env.FEE_PAYER_WALLET_PATH!);

    // Initialize connection and programs
    const { provider } = createSolanaConnection(
      feePayerWallet.publicKey.toString(),
    );
    const program = await init(provider);
    const tuktukProgram = await initTuktuk(provider);
    const welcomePack = await program.account.welcomePackV0.fetch(
      new PublicKey(packAddress),
    );

    // Prepare claim transaction
    const {
      instruction: ix,
      pubkeys: { rewardsMint },
    } = await (
      await claimWelcomePack({
        program,
        claimer: new PublicKey(walletAddress),
        tuktukProgram,
        taskQueue: new PublicKey(process.env.HPL_CRONS_TASK_QUEUE!),
        welcomePack: new PublicKey(packAddress),
        claimApproval: {
          uniqueId: welcomePack.uniqueId,
          expirationTimestamp: new BN(parseInt(expirationTs)),
        },
        claimApprovalSignature: signatureBytes,
        payer: feePayerWallet.publicKey,
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
        instructions: [
          ix,
          createAssociatedTokenAccountIdempotentInstruction(
            new PublicKey(walletAddress),
            getAssociatedTokenAddressSync(
              rewardsMint!,
              new PublicKey(walletAddress),
              true,
            ),
            new PublicKey(walletAddress),
            rewardsMint!,
          ),
        ],
        feePayer: feePayerWallet.publicKey,
      },
      signers: [feePayerWallet],
    });

    const tag = generateTransactionTag({
      type: TRANSACTION_TYPES.WELCOME_PACK_CLAIM,
      packAddress,
      walletAddress,
    });

    // Fee is 0 for claimer since fee payer covers the cost
    return {
      transactionData: {
        transactions: [
          {
            serializedTransaction: serializeTransaction(tx),
            metadata: {
              type: "welcome_pack_claim",
              description: "Claim welcome pack",
            },
          },
        ],
        parallel: true,
        tag,
        actionMetadata: {
          type: "welcome_pack_claim",
          packAddress,
          rewardsMint: rewardsMint?.toBase58(),
        },
      },
      estimatedSolFee: toTokenAmountOutput(new BN(0), NATIVE_MINT.toBase58()),
    };
  },
);
