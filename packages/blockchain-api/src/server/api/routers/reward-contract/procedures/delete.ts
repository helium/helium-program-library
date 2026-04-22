import { publicProcedure } from "../../../procedures";
import { env } from "@/lib/env";
import { HNT_LAZY_DISTRIBUTOR_ADDRESS } from "@/lib/constants/lazy-distributor";
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
import { getAssetIdFromPubkey } from "@/lib/utils/hotspot-helpers";
import {
  generateTransactionTag,
  TRANSACTION_TYPES,
} from "@/lib/utils/transaction-tags";
import {
  init as initLd,
  recipientKey,
  updateCompressionDestination,
} from "@helium/lazy-distributor-sdk";
import { init as initMiniFanout } from "@helium/mini-fanout-sdk";
import { getAsset, getAssetProof } from "@helium/spl-utils";
import { init as initTuktuk } from "@helium/tuktuk-sdk";
import {
  closeWelcomePack,
  init as initWelcomePack,
  userWelcomePacksKey,
  welcomePackKey,
} from "@helium/welcome-pack-sdk";
import { Connection, PublicKey, TransactionInstruction } from "@solana/web3.js";
import { toTokenAmountOutput } from "@/lib/utils/token-math";
import { NATIVE_MINT } from "@solana/spl-token";
import BN from "bn.js";

export const deleteMethod = publicProcedure.rewardContract.delete.handler(
  async ({ input, errors }) => {
    const { entityPubKey, signerWalletAddress } = input;

    const assetId = await getAssetIdFromPubkey(entityPubKey);
    if (!assetId) {
      throw errors.NOT_FOUND({ message: "Hotspot not found" });
    }

    const { connection, provider } =
      createSolanaConnection(signerWalletAddress);
    const assetEndpoint = env.ASSET_ENDPOINT || connection.rpcEndpoint;
    const assetPubkey = new PublicKey(assetId);

    // Step 1: Check for PENDING welcome pack (on-chain)
    const wpProgram = await initWelcomePack(provider);
    const asset = await getAsset(assetEndpoint, assetPubkey);

    if (asset) {
      const assetOwner = new PublicKey(
        typeof asset.ownership.owner === "string"
          ? asset.ownership.owner
          : asset.ownership.owner.toBase58(),
      );

      // When asset is transferred to WelcomePack, assetOwner IS the pack address
      const directWelcomePack =
        await wpProgram.account.welcomePackV0.fetchNullable(assetOwner);
      if (directWelcomePack && directWelcomePack.asset.equals(assetPubkey)) {
        if (directWelcomePack.owner.toBase58() !== signerWalletAddress) {
          throw errors.UNAUTHORIZED({
            message:
              "Wallet is not the delegate of the reward contract for the specified entity.",
          });
        }

        const { instruction: ix } = await (
          await closeWelcomePack({
            program: wpProgram,
            welcomePack: assetOwner,
            getAssetFn: (_, id) => getAsset(assetEndpoint, id),
            getAssetProofFn: (_, id) => getAssetProof(assetEndpoint, id),
          })
        ).prepare();

        return buildDeleteTransaction(
          [ix],
          signerWalletAddress,
          entityPubKey,
          "Delete pending reward contract",
          connection,
          errors,
        );
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
            if (welcomePack.owner.toBase58() !== signerWalletAddress) {
              throw errors.UNAUTHORIZED({
                message:
                  "Wallet is not the delegate of the reward contract for the specified entity.",
              });
            }

            const { instruction: ix } = await (
              await closeWelcomePack({
                program: wpProgram,
                welcomePack: welcomePackK,
                getAssetFn: (_, id) => getAsset(assetEndpoint, id),
                getAssetProofFn: (_, id) => getAssetProof(assetEndpoint, id),
              })
            ).prepare();

            return buildDeleteTransaction(
              [ix],
              signerWalletAddress,
              entityPubKey,
              "Delete pending reward contract",
              connection,
              errors,
            );
          }
        }
      }
    }

    // Step 2: Check for ACTIVE MiniFanout via recipient's destination
    // The recipient account's destination field points to the mini fanout
    const mfProgram = await initMiniFanout(provider);
    const tuktukProgram = await initTuktuk(provider);
    const ldProgram = await initLd(provider);

    const lazyDistributor = new PublicKey(HNT_LAZY_DISTRIBUTOR_ADDRESS);
    const [recipientK] = recipientKey(lazyDistributor, assetPubkey);
    const recipientAcc =
      await ldProgram.account.recipientV0.fetchNullable(recipientK);

    if (recipientAcc && !recipientAcc.destination.equals(PublicKey.default)) {
      const miniFanout = recipientAcc.destination;
      // Wrap in try/catch because destination may point to a non-MiniFanout account
      // which would cause a deserialization error rather than returning null
      let miniFanoutAccount = null;
      try {
        miniFanoutAccount =
          await mfProgram.account.miniFanoutV0.fetchNullable(miniFanout);
      } catch {
        // Destination exists but is not a MiniFanout account - treat as no contract
      }

      if (miniFanoutAccount) {
        if (miniFanoutAccount.owner.toBase58() !== signerWalletAddress) {
          throw errors.UNAUTHORIZED({
            message:
              "Wallet is not the delegate of the reward contract for the specified entity.",
          });
        }

        const task = miniFanoutAccount.nextTask.equals(miniFanout)
          ? null
          : await tuktukProgram.account.taskV0.fetchNullable(
              miniFanoutAccount.nextTask,
            );

        const closeIx = await mfProgram.methods
          .closeMiniFanoutV0()
          .accountsPartial({
            miniFanout: miniFanout,
            taskRentRefund:
              task?.rentRefund || new PublicKey(signerWalletAddress),
          })
          .instruction();

        const setRecipientIx = await (
          await updateCompressionDestination({
            program: ldProgram,
            assetId: assetPubkey,
            lazyDistributor,
            destination: null,
            getAssetFn: (_, id) => getAsset(assetEndpoint, id),
            getAssetProofFn: (_, id) => getAssetProof(assetEndpoint, id),
          })
        ).instruction();

        return buildDeleteTransaction(
          [closeIx, setRecipientIx],
          signerWalletAddress,
          entityPubKey,
          "Delete active reward contract",
          connection,
          errors,
        );
      }
    }

    // Step 3: NOT_FOUND
    throw errors.NOT_FOUND({
      message: "Hotspot does not have a reward contract.",
    });
  },
);

async function buildDeleteTransaction(
  instructions: TransactionInstruction[],
  signerWalletAddress: string,
  entityPubKey: string,
  description: string,
  connection: Connection,
  errors: Parameters<
    Parameters<typeof publicProcedure.rewardContract.delete.handler>[0]
  >[0]["errors"],
) {
  const walletBalance = await connection.getBalance(
    new PublicKey(signerWalletAddress),
  );
  const required = calculateRequiredBalance(BASE_TX_FEE_LAMPORTS, 0);
  if (walletBalance < required) {
    throw errors.INSUFFICIENT_FUNDS({
      message: "Insufficient SOL balance for transaction fees",
      data: { required, available: walletBalance },
    });
  }

  const tx = await buildVersionedTransaction({
    connection,
    draft: {
      instructions,
      feePayer: new PublicKey(signerWalletAddress),
    },
  });

  const tag = generateTransactionTag({
    type: TRANSACTION_TYPES.REWARD_CONTRACT_DELETE,
    walletAddress: signerWalletAddress,
    entityPubKey,
  });

  const txFee = getTransactionFee(tx);

  return {
    unsignedTransactionData: {
      transactions: [
        {
          serializedTransaction: serializeTransaction(tx),
          metadata: {
            type: "reward_contract_delete",
            description,
          },
        },
      ],
      parallel: false,
      tag,
    },
    estimatedSolFee: await toTokenAmountOutput(
      new BN(txFee),
      NATIVE_MINT.toBase58(),
    ),
  };
}
