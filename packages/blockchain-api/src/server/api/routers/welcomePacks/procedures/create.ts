import { publicProcedure } from "../../../procedures";
import { env } from "@/lib/env";
import { WelcomePackWithStatus } from "@/lib/models/welcome-pack";
import { createSolanaConnection } from "@/lib/solana";
import {
  calculateRequiredBalance,
  getTransactionFee,
  BASE_TX_FEE_LAMPORTS,
  getWelcomePackRentParts,
  getWelcomePackCost,
  RECIPIENT_SPACE,
  getRentLamports,
} from "@/lib/utils/balance-validation";
import { preTaskUrl } from "@/lib/constants/tuktuk";
import {
  buildVersionedTransaction,
  serializeTransaction,
} from "@/lib/utils/build-transaction";
import { scheduleToUtcCron } from "@/lib/utils/misc";
import {
  resolveTokenAmountInput,
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
} from "@helium/lazy-distributor-sdk";
import { getAsset, getAssetProof, HNT_MINT } from "@helium/spl-utils";
import { NATIVE_MINT } from "@solana/spl-token";
import {
  init,
  initializeWelcomePack,
  userWelcomePacksKey,
} from "@helium/welcome-pack-sdk";
import { PublicKey, TransactionInstruction } from "@solana/web3.js";
import BN from "bn.js";

/**
 * Create a new welcome pack.
 */
export const create = publicProcedure.welcomePacks.create.handler(
  async ({ input, errors }) => {
    const {
      walletAddress,
      assetId,
      solAmount,
      rentRefund,
      assetReturnAddress,
      rewardsSplit,
      schedule,
      lazyDistributor,
    } = input;

    if (!assetId) {
      throw errors.BAD_REQUEST({ message: "Asset ID is required" });
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

    if (!rentRefund || !assetReturnAddress) {
      throw errors.BAD_REQUEST({ message: "Return addresses are required" });
    }

    if (!solAmount?.amount || solAmount.amount === "0") {
      throw errors.BAD_REQUEST({
        message: "SOL amount must be greater than 0",
      });
    }

    for (const split of rewardsSplit) {
      if (!split.address) {
        throw errors.BAD_REQUEST({
          message: "Each reward split must have an address",
        });
      }

      if (
        split.type === "percentage" &&
        (split.amount < 0 || split.amount > 100)
      ) {
        throw errors.BAD_REQUEST({
          message: "Percentage rewards must be between 0 and 100",
        });
      }

      if (
        split.type === "fixed" &&
        (!split.tokenAmount?.amount || split.tokenAmount.amount === "0")
      ) {
        throw errors.BAD_REQUEST({
          message: "Fixed rewards must be greater than 0",
        });
      }
    }

    const { connection, provider, wallet } =
      createSolanaConnection(walletAddress);
    const program = await init(provider);
    const ldProgram = await initLd(provider);

    const rewardsSchedule = scheduleToUtcCron(schedule);

    const recipientK = recipientKey(
      new PublicKey(lazyDistributor),
      new PublicKey(assetId),
    )[0];
    const recipient =
      await ldProgram.account.recipientV0.fetchNullable(recipientK);

    // Check wallet has sufficient balance
    const walletBalance = await connection.getBalance(wallet.publicKey);
    const numFixedShares = rewardsSplit.filter(
      (split) => split.type === "fixed",
    ).length;
    // With more than one split, initialize_welcome_pack_v0 also escrows the
    // future mini fanout's rent, its HNT ATA rent and FANOUT_FUNDING_AMOUNT.
    const hasFanout = rewardsSplit.length > 1;
    const userWelcomePacksAccount =
      await program.account.userWelcomePacksV0.fetchNullable(
        userWelcomePacksKey(new PublicKey(walletAddress))[0],
      );
    const [
      { welcomePackRent, userWelcomePacksRent, fanoutRent, ataRent },
      recipientRent,
    ] = await Promise.all([
      getWelcomePackRentParts(connection, {
        numFixedShares,
        numPercentageShares: rewardsSplit.length - numFixedShares,
        scheduleLen: rewardsSchedule.length,
        preTaskUrlLen: preTaskUrl(assetId).length,
        userWelcomePacksExists: !!userWelcomePacksAccount,
      }),
      recipient ? 0 : getRentLamports(connection, RECIPIENT_SPACE),
    ]);
    const giftLamports = (
      await resolveTokenAmountInput(solAmount, NATIVE_MINT.toBase58())
    ).toNumber();
    const { packCost } = getWelcomePackCost({
      welcomePackRent,
      fanoutRent,
      ataRent,
      giftLamports,
      hasFanout,
    });
    const rentCost = packCost + userWelcomePacksRent + recipientRent;

    const required = await calculateRequiredBalance(
      connection,
      BASE_TX_FEE_LAMPORTS,
      rentCost,
    );
    if (walletBalance < required) {
      throw errors.INSUFFICIENT_FUNDS({
        message: "Insufficient SOL balance to create welcome pack",
        data: { required, available: walletBalance },
      });
    }

    const instructions: TransactionInstruction[] = [];

    if (!recipient) {
      instructions.push(
        await (
          await initializeCompressionRecipient({
            program: ldProgram,
            assetId: new PublicKey(assetId),
            payer: wallet.publicKey,
            assetEndpoint: env.ASSET_ENDPOINT,
            lazyDistributor: new PublicKey(lazyDistributor),
          })
        ).instruction(),
      );
    }

    const { instruction: ix, pubkeys } = await (
      await initializeWelcomePack({
        program,
        assetId: new PublicKey(assetId),
        owner: new PublicKey(walletAddress),
        solAmount: await resolveTokenAmountInput(
          solAmount,
          NATIVE_MINT.toBase58(),
        ),
        rentRefund: new PublicKey(rentRefund),
        assetReturnAddress: new PublicKey(assetReturnAddress),
        rewardsSplit: await Promise.all(
          rewardsSplit.map(async (split) =>
            split.type === "percentage"
              ? {
                  share: { share: { amount: split.amount } },
                  wallet: new PublicKey(split.address),
                }
              : {
                  share: {
                    fixed: {
                      amount: await resolveTokenAmountInput(
                        split.tokenAmount,
                        HNT_MINT.toBase58(),
                      ),
                    },
                  },
                  wallet: new PublicKey(split.address),
                },
          ),
        ),
        rewardsSchedule,
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
        assetEndpoint: env.ASSET_ENDPOINT,
        lazyDistributor: new PublicKey(lazyDistributor),
      })
    ).prepare();
    instructions.push(ix);

    const tx = await buildVersionedTransaction({
      connection,
      draft: {
        instructions,
        feePayer: new PublicKey(walletAddress),
      },
    });

    const lazyDistributorAcc =
      await ldProgram.account.lazyDistributorV0.fetch(lazyDistributor);

    const welcomePack: WelcomePackWithStatus = {
      address: pubkeys.welcomePack!.toBase58(),
      id: userWelcomePacksAccount?.nextId || 0,
      uniqueId: `${userWelcomePacksAccount?.nextUniqueId || 0}`,
      owner: walletAddress,
      rewardsSplit: rewardsSplit.map((split) =>
        split.type === "percentage"
          ? { address: split.address, type: split.type, amount: split.amount }
          : {
              address: split.address,
              type: split.type,
              tokenAmount: split.tokenAmount,
            },
      ),
      rewardsSchedule,
      solAmount: solAmount.amount,
      assetReturnAddress,
      asset: assetId,
      lazyDistributor,
      loading: true,
      rewardsMint: lazyDistributorAcc.rewardsMint.toBase58(),
      rentRefund: rentRefund.toString(),
      bumpSeed: 0,
      hotspot: null,
    };

    const tag = generateTransactionTag({
      type: TRANSACTION_TYPES.WELCOME_PACK_CREATE,
      walletAddress,
      assetId,
    });

    const txFee = await getTransactionFee(connection, tx);
    const estimatedSolFeeLamports = txFee + rentCost;

    return {
      welcomePack,
      transactionData: {
        transactions: [
          {
            serializedTransaction: serializeTransaction(tx),
            metadata: {
              type: "welcome_pack_create",
              description: "Create welcome pack",
            },
          },
        ],
        parallel: true,
        tag,
        actionMetadata: {
          type: "welcome_pack_create",
          assetId,
          solAmount: await toTokenAmountOutput(
            new BN(input.solAmount.amount),
            input.solAmount.mint,
          ),
          recipientCount: input.rewardsSplit.length,
          recipients: input.rewardsSplit.map((s) => s.address),
        },
      },
      estimatedSolFee: await toTokenAmountOutput(
        new BN(estimatedSolFeeLamports),
        NATIVE_MINT.toBase58(),
      ),
    };
  },
);
