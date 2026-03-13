import { publicProcedure } from "../../../procedures";
import { env } from "@/lib/env";
import { createSolanaConnection, loadKeypair } from "@/lib/solana";
import {
  buildVersionedTransaction,
  serializeTransaction,
} from "@/lib/utils/build-transaction";
import { getAssetIdFromPubkey } from "@/lib/utils/hotspot-helpers";
import {
  generateTransactionTag,
  TRANSACTION_TYPES,
} from "@/lib/utils/transaction-tags";
import { getAsset, getAssetProof } from "@helium/spl-utils";
import { init as initTuktuk } from "@helium/tuktuk-sdk";
import {
  claimWelcomePack,
  init as initWelcomePack,
  userWelcomePacksKey,
  welcomePackKey,
} from "@helium/welcome-pack-sdk";
import {
  createAssociatedTokenAccountIdempotentInstruction,
  getAssociatedTokenAddressSync,
  NATIVE_MINT,
} from "@solana/spl-token";
import { PublicKey, TransactionInstruction } from "@solana/web3.js";
import BN from "bn.js";
import { toTokenAmountOutput } from "@/lib/utils/token-math";

export const claim = publicProcedure.rewardContract.claim.handler(
  async ({ input, errors }) => {
    const { entityPubKey, signerWalletAddress, delegateSignature, expiration } =
      input;

    const assetId = await getAssetIdFromPubkey(entityPubKey);
    if (!assetId) {
      throw errors.NOT_FOUND({ message: "Hotspot not found" });
    }

    const expirationTs = Math.floor(new Date(expiration).getTime() / 1000);
    const currentTs = Math.floor(Date.now() / 1000);
    if (currentTs > expirationTs) {
      throw errors.BAD_REQUEST({ message: "Invite has expired" });
    }

    const signatureBytes = Buffer.from(delegateSignature, "base64");

    const feePayerWallet = loadKeypair(process.env.FEE_PAYER_WALLET_PATH!);

    const { provider, connection } = createSolanaConnection(
      feePayerWallet.publicKey.toString(),
    );
    const assetEndpoint = env.ASSET_ENDPOINT || connection.rpcEndpoint;
    const assetPubkey = new PublicKey(assetId);

    const wpProgram = await initWelcomePack(provider);
    const tuktukProgram = await initTuktuk(provider);

    const asset = await getAsset(assetEndpoint, assetPubkey);
    if (!asset) {
      throw errors.NOT_FOUND({ message: "Asset not found" });
    }
    const assetOwner = new PublicKey(
      typeof asset.ownership.owner === "string"
        ? asset.ownership.owner
        : asset.ownership.owner.toBase58(),
    );

    // When asset is transferred to WelcomePack, assetOwner IS the pack address
    const directWelcomePack =
      await wpProgram.account.welcomePackV0.fetchNullable(assetOwner);
    if (directWelcomePack && directWelcomePack.asset.equals(assetPubkey)) {
      return buildClaimTransaction({
        wpProgram,
        tuktukProgram,
        welcomePackK: assetOwner,
        welcomePack: directWelcomePack,
        assetEndpoint,
        signerWalletAddress,
        feePayerWallet,
        expirationTs,
        signatureBytes,
        connection,
        entityPubKey,
        errors,
      });
    }

    // Iteration fallback - assetOwner is a wallet with UserWelcomePacks
    const [userWelcomePacksK] = userWelcomePacksKey(assetOwner);
    const userWelcomePacks =
      await wpProgram.account.userWelcomePacksV0.fetchNullable(
        userWelcomePacksK,
      );

    if (userWelcomePacks) {
      for (let i = 0; i < (userWelcomePacks.nextId || 0); i++) {
        const [welcomePackK] = welcomePackKey(assetOwner, i);
        const welcomePack =
          await wpProgram.account.welcomePackV0.fetchNullable(welcomePackK);

        if (welcomePack && welcomePack.asset.equals(assetPubkey)) {
          return buildClaimTransaction({
            wpProgram,
            tuktukProgram,
            welcomePackK,
            welcomePack,
            assetEndpoint,
            signerWalletAddress,
            feePayerWallet,
            expirationTs,
            signatureBytes,
            connection,
            entityPubKey,
            errors,
          });
        }
      }
    }

    throw errors.NOT_FOUND({ message: "Reward contract not found." });
  },
);

async function buildClaimTransaction({
  wpProgram,
  tuktukProgram,
  welcomePackK,
  welcomePack,
  assetEndpoint,
  signerWalletAddress,
  feePayerWallet,
  expirationTs,
  signatureBytes,
  connection,
  entityPubKey,
  errors,
}: {
  wpProgram: Awaited<ReturnType<typeof initWelcomePack>>;
  tuktukProgram: Awaited<ReturnType<typeof initTuktuk>>;
  welcomePackK: PublicKey;
  welcomePack: NonNullable<
    Awaited<ReturnType<typeof wpProgram.account.welcomePackV0.fetchNullable>>
  >;
  assetEndpoint: string;
  signerWalletAddress: string;
  feePayerWallet: ReturnType<typeof loadKeypair>;
  expirationTs: number;
  signatureBytes: Buffer;
  connection: ReturnType<typeof createSolanaConnection>["connection"];
  entityPubKey: string;
  errors: Parameters<
    Parameters<typeof publicProcedure.rewardContract.claim.handler>[0]
  >[0]["errors"];
}) {
  let ix: TransactionInstruction;
  let rewardsMint: PublicKey | undefined;

  try {
    const result = await (
      await claimWelcomePack({
        program: wpProgram,
        claimer: new PublicKey(signerWalletAddress),
        tuktukProgram,
        taskQueue: new PublicKey(process.env.HPL_CRONS_TASK_QUEUE!),
        welcomePack: welcomePackK,
        claimApproval: {
          uniqueId: welcomePack.uniqueId,
          expirationTimestamp: new BN(expirationTs),
        },
        claimApprovalSignature: signatureBytes,
        payer: feePayerWallet.publicKey,
        getAssetFn: (_, id) => getAsset(assetEndpoint, id),
        getAssetProofFn: (_, id) => getAssetProof(assetEndpoint, id),
      })
    ).prepare();
    ix = result.instruction;
    rewardsMint = result.pubkeys.rewardsMint;
  } catch (err) {
    console.error("[claim] SDK error:", err);
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.toLowerCase().includes("signature")) {
      throw errors.BAD_REQUEST({ message: "Invalid delegate signature" });
    }
    if (msg.toLowerCase().includes("expired")) {
      throw errors.BAD_REQUEST({ message: "Invite has expired" });
    }
    if (
      msg.toLowerCase().includes("already claimed") ||
      msg.toLowerCase().includes("already been claimed")
    ) {
      throw errors.BAD_REQUEST({
        message: "Welcome pack has already been claimed",
      });
    }
    throw errors.BAD_REQUEST({
      message: `Failed to build claim transaction: ${msg}`,
    });
  }

  if (!rewardsMint) {
    throw errors.BAD_REQUEST({ message: "Failed to resolve rewards mint" });
  }

  const tx = await buildVersionedTransaction({
    connection,
    draft: {
      instructions: [
        ix,
        createAssociatedTokenAccountIdempotentInstruction(
          new PublicKey(signerWalletAddress),
          getAssociatedTokenAddressSync(
            rewardsMint,
            new PublicKey(signerWalletAddress),
            true,
          ),
          new PublicKey(signerWalletAddress),
          rewardsMint,
        ),
      ],
      feePayer: feePayerWallet.publicKey,
    },
    signers: [feePayerWallet],
  });

  const tag = generateTransactionTag({
    type: TRANSACTION_TYPES.REWARD_CONTRACT_CLAIM,
    entityPubKey,
    walletAddress: signerWalletAddress,
  });

  // Fee is 0 for claimer since fee payer covers the cost
  return {
    unsignedTransactionData: {
      transactions: [
        {
          serializedTransaction: serializeTransaction(tx),
          metadata: {
            type: "reward_contract_claim",
            description: "Claim reward contract",
          },
        },
      ],
      parallel: false,
      tag,
    },
    estimatedSolFee: toTokenAmountOutput(new BN(0), NATIVE_MINT.toBase58()),
  };
}
