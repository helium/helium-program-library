import { publicProcedure } from "../../../procedures";
import { env } from "@/lib/env";
import { createSolanaConnection, getCluster } from "@/lib/solana";
import { connectToDb } from "@/lib/utils/db";
import { scheduleToUtcCron } from "@/lib/utils/misc";
import { getAssetIdFromPubkey } from "@/lib/utils/hotspot-helpers";
import {
  initializeCompressionRecipient,
  init as initLd,
  recipientKey,
  updateCompressionDestination,
} from "@helium/lazy-distributor-sdk";
import { init as initMiniFanout } from "@helium/mini-fanout-sdk";
import {
  batchInstructionsToTxsWithPriorityFee,
  HELIUM_COMMON_LUT,
  HELIUM_COMMON_LUT_DEVNET,
  HNT_MINT,
  toVersionedTx,
} from "@helium/spl-utils";
import {
  init as initTuktuk,
  nextAvailableTaskIds,
  taskKey,
} from "@helium/tuktuk-sdk";
import {
  PublicKey,
  SystemProgram,
  TransactionInstruction,
} from "@solana/web3.js";
import {
  resolveTokenAmountInput,
  solToLamportsBN,
} from "@/lib/utils/token-math";
import {
  generateTransactionTag,
  TRANSACTION_TYPES,
} from "@/lib/utils/transaction-tags";
import { getJitoTipTransaction, shouldUseJitoBundle } from "@/lib/utils/jito";
import {
  getTotalTransactionFees,
  RENT_COSTS,
} from "@/lib/utils/balance-validation";
import { toTokenAmountOutput } from "@/lib/utils/token-math";
import { NATIVE_MINT } from "@solana/spl-token";
import BN from "bn.js";
import { TASK_QUEUE_ID } from "@/lib/constants/tuktuk";

const FANOUT_FUNDING_AMOUNT = solToLamportsBN(0.01).toNumber();

/**
 * Create a split configuration for a hotspot with reward distribution.
 */
export const createSplit = publicProcedure.hotspots.createSplit.handler(
  async ({ input, errors }) => {
    const {
      walletAddress,
      hotspotPubkey,
      rewardsSplit,
      schedule,
      lazyDistributor,
    } = input;

    await connectToDb();

    // Resolve hotspot pubkey to asset ID
    const assetId = await getAssetIdFromPubkey(hotspotPubkey);
    if (!assetId) {
      throw errors.NOT_FOUND({ message: "Hotspot not found" });
    }

    if (!rewardsSplit?.length) {
      throw errors.BAD_REQUEST({
        message: "At least one reward split is required",
      });
    }

    if (!schedule?.frequency || !schedule?.time || !schedule?.timezone) {
      throw errors.BAD_REQUEST({
        message: "Schedule frequency, time, and timezone are required",
      });
    }

    // Build connection and programs
    const { provider, wallet } = createSolanaConnection(walletAddress);
    const miniFanoutProgram = await initMiniFanout(provider);
    const tuktukProgram = await initTuktuk(provider);
    const ldProgram = await initLd(provider);

    // Convert schedule to UTC cron string
    const rewardsSchedule = scheduleToUtcCron(schedule);

    // Ensure Lazy Distributor Recipient exists for the asset
    const recipientK = recipientKey(
      new PublicKey(lazyDistributor),
      new PublicKey(assetId),
    )[0];
    const recipientAcc =
      await ldProgram.account.recipientV0.fetchNullable(recipientK);
    const instructions: TransactionInstruction[] = [];

    if (!recipientAcc) {
      instructions.push(
        await (
          await initializeCompressionRecipient({
            program: ldProgram,
            assetId: new PublicKey(assetId),
            payer: wallet.publicKey,
            assetEndpoint: env.SOLANA_RPC_URL,
            lazyDistributor: new PublicKey(lazyDistributor),
          })
        ).instruction(),
      );
    }

    const oracleSigner = new PublicKey(process.env.ORACLE_SIGNER!);
    const oracleUrl = process.env.ORACLE_URL!;

    const { instruction: initIx, pubkeys } = await miniFanoutProgram.methods
      .initializeMiniFanoutV0({
        seed: new PublicKey(assetId).toBuffer(),
        shares: rewardsSplit.map((split) => ({
          wallet: new PublicKey(split.address),
          share:
            split.type === "fixed"
              ? {
                  fixed: {
                    amount: resolveTokenAmountInput(
                      split.tokenAmount,
                      HNT_MINT.toBase58(),
                    ),
                  },
                }
              : { share: { amount: split.amount } },
        })),
        schedule: rewardsSchedule,
        preTask: {
          remoteV0: {
            url: `${oracleUrl}/v1/tuktuk/asset/${assetId}`,
            signer: oracleSigner,
          },
        },
      })
      .accounts({
        payer: wallet.publicKey,
        owner: wallet.publicKey,
        taskQueue: TASK_QUEUE_ID,
        rentRefund: wallet.publicKey,
        mint: HNT_MINT,
      })
      .prepare();
    instructions.push(initIx);

    instructions.push(
      SystemProgram.transfer({
        fromPubkey: wallet.publicKey,
        toPubkey: pubkeys.miniFanout!,
        lamports: FANOUT_FUNDING_AMOUNT,
      }),
    );

    const taskQueueAcc =
      await tuktukProgram.account.taskQueueV0.fetchNullable(TASK_QUEUE_ID);
    const [taskId, preTaskId] = nextAvailableTaskIds(
      taskQueueAcc!.taskBitmap,
      2,
    );

    // Schedule a task for the mini fanout
    const scheduleIx = await (
      await miniFanoutProgram.methods
        .scheduleTaskV0({
          program: miniFanoutProgram,
          miniFanout: pubkeys.miniFanout!,
          taskId,
          preTaskId,
        })
        .accounts({
          taskQueue: TASK_QUEUE_ID,
          payer: wallet.publicKey,
          miniFanout: pubkeys.miniFanout!,
          task: taskKey(TASK_QUEUE_ID, taskId)[0],
          preTask: taskKey(TASK_QUEUE_ID, preTaskId)[0],
          nextTask: pubkeys.miniFanout!,
          nextPreTask: pubkeys.miniFanout!,
        })
    ).instruction();
    instructions.push(scheduleIx);

    // Point hotspot rewards destination to the mini fanout
    const setRecipientIx = await (
      await updateCompressionDestination({
        program: ldProgram,
        assetId: new PublicKey(assetId),
        lazyDistributor: new PublicKey(lazyDistributor),
        destination: pubkeys.miniFanout!,
      })
    ).instruction();
    instructions.push(setRecipientIx);

    const txs = (
      await batchInstructionsToTxsWithPriorityFee(provider, instructions, {
        addressLookupTableAddresses: [
          process.env.NEXT_PUBLIC_SOLANA_CLUSTER === "devnet"
            ? HELIUM_COMMON_LUT_DEVNET
            : HELIUM_COMMON_LUT,
        ],
        commitment: "finalized",
      })
    ).map((tx) => toVersionedTx(tx));

    const tag = generateTransactionTag({
      type: TRANSACTION_TYPES.ADD_SPLIT,
      walletAddress,
      assetId,
      lazyDistributor,
    });

    if (shouldUseJitoBundle(txs.length, getCluster())) {
      txs.push(await getJitoTipTransaction(new PublicKey(walletAddress)));
    }

    // Rent includes mini fanout account + 2 tuktuk tasks (task + preTask) + optional recipient
    const recipientRent = recipientAcc ? 0 : RENT_COSTS.RECIPIENT;
    const rentCost =
      RENT_COSTS.MINI_FANOUT + RENT_COSTS.TUKTUK_TASK * 2 + recipientRent;
    const txFees = getTotalTransactionFees(txs);
    const estimatedSolFeeLamports = txFees + rentCost + FANOUT_FUNDING_AMOUNT;

    const walletBalance = await provider.connection.getBalance(
      new PublicKey(walletAddress),
    );
    if (walletBalance < estimatedSolFeeLamports) {
      throw errors.INSUFFICIENT_FUNDS({
        message: "Insufficient SOL balance to create split",
        data: {
          required: estimatedSolFeeLamports,
          available: walletBalance,
        },
      });
    }

    return {
      transactionData: {
        transactions: txs.map((tx) => ({
          serializedTransaction: Buffer.from(tx.serialize()).toString("base64"),
          metadata: {
            type: "add_split",
            description: "Create split",
          },
        })),
        parallel: true,
        tag,
      },
      estimatedSolFee: toTokenAmountOutput(
        new BN(estimatedSolFeeLamports),
        NATIVE_MINT.toBase58(),
      ),
    };
  },
);
