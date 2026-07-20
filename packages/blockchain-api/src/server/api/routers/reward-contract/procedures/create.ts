import { publicProcedure } from "../../../procedures";
import { env } from "@/lib/env";
import { HNT_LAZY_DISTRIBUTOR_ADDRESS } from "@/lib/constants/lazy-distributor";
import { createSolanaConnection } from "@/lib/solana";
import {
  calculateRequiredBalance,
  getTransactionFee,
  BASE_TX_FEE_LAMPORTS,
  RENT_COSTS,
} from "@/lib/utils/balance-validation";
import {
  buildVersionedTransaction,
  serializeTransaction,
} from "@/lib/utils/build-transaction";
import { getAssetIdFromPubkey } from "@/lib/utils/hotspot-helpers";
import { toSixColumnCron } from "@/lib/utils/misc";
import {
  resolveTokenAmountInput,
  solToLamportsBN,
  toTokenAmountOutput,
} from "@/lib/utils/token-math";
import {
  generateTransactionTag,
  TRANSACTION_TYPES,
} from "@/lib/utils/transaction-tags";
import {
  initializeCompressionRecipient,
  init as initLd,
  recipientKey,
  updateCompressionDestination,
} from "@helium/lazy-distributor-sdk";
import { init as initMiniFanout, miniFanoutKey } from "@helium/mini-fanout-sdk";
import {
  getAsset,
  getAssetProof,
  HNT_MINT,
  proofArgsAndAccounts,
} from "@helium/spl-utils";
import { NATIVE_MINT } from "@solana/spl-token";
import {
  init as initTuktuk,
  nextAvailableTaskIds,
  taskKey,
} from "@helium/tuktuk-sdk";
import {
  init,
  initializeWelcomePack,
  userWelcomePacksKey,
  welcomePackKey,
} from "@helium/welcome-pack-sdk";
import {
  PublicKey,
  SystemProgram,
  TransactionInstruction,
} from "@solana/web3.js";
import BN from "bn.js";

const FANOUT_FUNDING_AMOUNT = solToLamportsBN(0.01).toNumber();

export const create = publicProcedure.rewardContract.create.handler(
  async ({ input, errors }) => {
    const {
      entityPubKey,
      signerWalletAddress,
      delegateWalletAddress,
      recipients,
      rewardSchedule,
    } = input;

    const assetId = await getAssetIdFromPubkey(entityPubKey);
    if (!assetId) {
      throw errors.NOT_FOUND({ message: "Hotspot not found" });
    }

    const { connection, provider } =
      createSolanaConnection(signerWalletAddress);
    const assetEndpoint = env.ASSET_ENDPOINT || connection.rpcEndpoint;
    const assetPubkey = new PublicKey(assetId);

    const { asset } = await proofArgsAndAccounts({
      connection,
      assetId: assetPubkey,
      assetEndpoint,
    });

    if (!asset) {
      throw errors.NOT_FOUND({ message: "Asset not found" });
    }

    const ownerAddress =
      typeof asset.ownership.owner === "string"
        ? asset.ownership.owner
        : asset.ownership.owner.toBase58();

    if (ownerAddress !== signerWalletAddress) {
      throw errors.UNAUTHORIZED({
        message: "Wallet does not own the specified entity.",
      });
    }

    const ldProgram = await initLd(provider);
    const instructions: TransactionInstruction[] = [];

    const recipientK = recipientKey(
      new PublicKey(HNT_LAZY_DISTRIBUTOR_ADDRESS),
      assetPubkey,
    )[0];
    const recipientAcc =
      await ldProgram.account.recipientV0.fetchNullable(recipientK);

    if (!recipientAcc) {
      instructions.push(
        await (
          await initializeCompressionRecipient({
            program: ldProgram,
            assetId: assetPubkey,
            payer: new PublicKey(signerWalletAddress),
            assetEndpoint,
            lazyDistributor: new PublicKey(HNT_LAZY_DISTRIBUTOR_ADDRESS),
          })
        ).instruction(),
      );
    }

    const hasClaimable = recipients.some((r) => r.type === "CLAIMABLE");

    // Check wallet has sufficient balance
    const walletBalance = await connection.getBalance(
      new PublicKey(signerWalletAddress),
    );
    let rentCost = 0;
    if (!recipientAcc) {
      rentCost += RENT_COSTS.RECIPIENT;
    }

    if (hasClaimable) {
      // Welcome pack path - add pack rent + gifted SOL
      rentCost += RENT_COSTS.WELCOME_PACK + RENT_COSTS.USER_WELCOME_PACKS;
      const claimableRecipient = recipients.find((r) => r.type === "CLAIMABLE");
      if (claimableRecipient?.type === "CLAIMABLE") {
        rentCost += (await resolveTokenAmountInput(
          claimableRecipient.giftedCurrency,
          NATIVE_MINT.toBase58(),
        )).toNumber();
      }
    } else {
      // Mini-fanout path - add funding amount
      rentCost += FANOUT_FUNDING_AMOUNT;
    }

    const required = calculateRequiredBalance(BASE_TX_FEE_LAMPORTS, rentCost);
    if (walletBalance < required) {
      throw errors.INSUFFICIENT_FUNDS({
        message: "Insufficient SOL balance to create reward contract",
        data: { required, available: walletBalance },
      });
    }

    if (hasClaimable) {
      const program = await init(provider);

      const [uwpKey] = userWelcomePacksKey(
        new PublicKey(delegateWalletAddress),
      );
      const uwpAcc =
        await program.account.userWelcomePacksV0.fetchNullable(uwpKey);
      if (uwpAcc && uwpAcc.nextId > 0) {
        const packKeys = Array.from(
          { length: uwpAcc.nextId },
          (_, i) => welcomePackKey(new PublicKey(delegateWalletAddress), i)[0],
        );
        const packs =
          await program.account.welcomePackV0.fetchMultiple(packKeys);
        if (packs.some((p) => p && p.asset.equals(assetPubkey))) {
          throw errors.CONFLICT({
            message: "A welcome pack already exists for this hotspot",
          });
        }
      }

      const claimableRecipient = recipients.find((r) => r.type === "CLAIMABLE");
      const solAmount =
        claimableRecipient?.type === "CLAIMABLE"
          ? await resolveTokenAmountInput(
              claimableRecipient.giftedCurrency,
              NATIVE_MINT.toBase58(),
            )
          : new BN(0);

      const rewardsSplit = await Promise.all(recipients.map(async (r) => {
        const wallet =
          r.type === "PRESET"
            ? new PublicKey(r.walletAddress)
            : PublicKey.default;

        if (r.receives.type === "FIXED") {
          return {
            share: {
              fixed: {
                amount: await resolveTokenAmountInput(
                  r.receives.tokenAmount,
                  HNT_MINT.toBase58(),
                ),
              },
            },
            wallet,
          };
        }
        return {
          share: { share: { amount: r.receives.shares } },
          wallet,
        };
      }));

      const { instruction: ix } = await (
        await initializeWelcomePack({
          program,
          assetId: assetPubkey,
          owner: new PublicKey(delegateWalletAddress),
          solAmount,
          rentRefund: new PublicKey(signerWalletAddress),
          assetReturnAddress: new PublicKey(signerWalletAddress),
          rewardsSplit,
          rewardsSchedule: toSixColumnCron(rewardSchedule),
          getAssetFn: (_, id) => getAsset(assetEndpoint, id),
          getAssetProofFn: (_, id) => getAssetProof(assetEndpoint, id),
          assetEndpoint,
          lazyDistributor: new PublicKey(HNT_LAZY_DISTRIBUTOR_ADDRESS),
        })
      ).prepare();
      instructions.push(ix);
    } else {
      const miniFanoutProgram = await initMiniFanout(provider);
      const tuktukProgram = await initTuktuk(provider);
      const [miniFanoutK] = miniFanoutKey(
        new PublicKey(signerWalletAddress),
        assetPubkey.toBuffer(),
      );

      const existingMiniFanout =
        await miniFanoutProgram.account.miniFanoutV0.fetchNullable(miniFanoutK);

      if (existingMiniFanout) {
        throw errors.CONFLICT({
          message: "A reward contract already exists for this hotspot",
        });
      }

      const taskQueueId = new PublicKey(process.env.HPL_CRONS_TASK_QUEUE!);
      const oracleSigner = new PublicKey(env.ORACLE_SIGNER);
      const oracleUrl = env.ORACLE_URL;

      const shares = await Promise.all(recipients.map(async (r) => {
        const wallet =
          r.type === "PRESET"
            ? new PublicKey(r.walletAddress)
            : PublicKey.default;

        if (r.receives.type === "FIXED") {
          return {
            wallet,
            share: {
              fixed: {
                amount: await resolveTokenAmountInput(
                  r.receives.tokenAmount,
                  HNT_MINT.toBase58(),
                ),
              },
            },
          };
        }
        return {
          wallet,
          share: { share: { amount: r.receives.shares } },
        };
      }));

      const { instruction: initIx, pubkeys } = await miniFanoutProgram.methods
        .initializeMiniFanoutV0({
          seed: assetPubkey.toBuffer(),
          shares,
          schedule: toSixColumnCron(rewardSchedule),
          preTask: {
            remoteV0: {
              url: `${oracleUrl}/v1/tuktuk/asset/${assetId}`,
              signer: oracleSigner,
            },
          },
        })
        .accounts({
          payer: new PublicKey(signerWalletAddress),
          owner: new PublicKey(delegateWalletAddress),
          taskQueue: taskQueueId,
          rentRefund: new PublicKey(signerWalletAddress),
          mint: HNT_MINT,
        })
        .prepare();

      instructions.push(initIx);
      instructions.push(
        SystemProgram.transfer({
          fromPubkey: new PublicKey(signerWalletAddress),
          toPubkey: pubkeys.miniFanout!,
          lamports: FANOUT_FUNDING_AMOUNT,
        }),
      );

      const taskQueueAcc =
        await tuktukProgram.account.taskQueueV0.fetchNullable(taskQueueId);

      const [taskId, preTaskId] = nextAvailableTaskIds(
        taskQueueAcc!.taskBitmap,
        2,
      );

      const scheduleIx = await miniFanoutProgram.methods
        .scheduleTaskV0({
          program: miniFanoutProgram,
          miniFanout: pubkeys.miniFanout!,
          taskId,
          preTaskId,
        })
        .accounts({
          taskQueue: taskQueueId,
          payer: new PublicKey(signerWalletAddress),
          miniFanout: pubkeys.miniFanout!,
          task: taskKey(taskQueueId, taskId)[0],
          preTask: taskKey(taskQueueId, preTaskId)[0],
          nextTask: pubkeys.miniFanout!,
          nextPreTask: pubkeys.miniFanout!,
        })
        .instruction();

      instructions.push(scheduleIx);

      const setRecipientIx = await (
        await updateCompressionDestination({
          program: ldProgram,
          assetId: assetPubkey,
          lazyDistributor: new PublicKey(HNT_LAZY_DISTRIBUTOR_ADDRESS),
          destination: pubkeys.miniFanout!,
          assetEndpoint,
        })
      ).instruction();

      instructions.push(setRecipientIx);
    }

    const tx = await buildVersionedTransaction({
      connection,
      draft: {
        instructions,
        feePayer: new PublicKey(signerWalletAddress),
      },
    });

    const tag = generateTransactionTag({
      type: TRANSACTION_TYPES.REWARD_CONTRACT_CREATE,
      walletAddress: signerWalletAddress,
      entityPubKey,
    });

    const txFee = getTransactionFee(tx);
    const estimatedSolFeeLamports = txFee + rentCost;

    return {
      unsignedTransactionData: {
        transactions: [
          {
            serializedTransaction: serializeTransaction(tx),
            metadata: {
              type: "reward_contract_create",
              description: "Create reward contract",
            },
          },
        ],
        parallel: false,
        tag,
      },
      estimatedSolFee: await toTokenAmountOutput(
        new BN(estimatedSolFeeLamports),
        NATIVE_MINT.toBase58(),
      ),
    };
  },
);
