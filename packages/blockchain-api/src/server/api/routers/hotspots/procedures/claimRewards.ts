import { publicProcedure } from "../../../procedures";
import {
  getHotspotsByOwner,
  getNumRecipientsNeeded,
} from "@/lib/queries/hotspots";
import { env } from "@/lib/env";
import { createSolanaConnection, getCluster } from "@/lib/solana";
import { init as initLd, recipientKey } from "@helium/lazy-distributor-sdk";
import { init as initMiniFanout } from "@helium/mini-fanout-sdk";
import { filterHotspotsWithoutMiniFanout } from "@/lib/utils/mini-fanout-helpers";
import {
  formBulkTransactions,
  getBulkRewards,
} from "@/utils/distributorOracle";
import {
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  TransactionInstruction,
  VersionedTransaction,
} from "@solana/web3.js";
import * as anchor from "@coral-xyz/anchor";
import {
  customSignerKey,
  init as initTuktuk,
  nextAvailableTaskIds,
  taskKey,
  taskQueueAuthorityKey,
} from "@helium/tuktuk-sdk";
import {
  HELIUM_COMMON_LUT,
  HELIUM_COMMON_LUT_DEVNET,
  HNT_MINT,
  batchInstructionsToTxsWithPriorityFee,
  toVersionedTx,
} from "@helium/spl-utils";
import { HNT_LAZY_DISTRIBUTOR_ADDRESS } from "@/lib/constants/lazy-distributor";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";
import { getJitoTipTransaction, shouldUseJitoBundle } from "@/lib/utils/jito";
import {
  getTotalTransactionFees,
  calculateRequiredBalance,
  BASE_TX_FEE_LAMPORTS,
} from "@/lib/utils/balance-validation";
import { toTokenAmountOutput } from "@/lib/utils/token-math";
import { NATIVE_MINT } from "@solana/spl-token";
import BN from "bn.js";

const MIN_RENT = 0.00089088;
const RECIPIENT_RENT = 0.00242208;
const ATA_RENT = 0.002039 * LAMPORTS_PER_SOL;
const MIN_RENT_LAMPORTS = Math.ceil(MIN_RENT * LAMPORTS_PER_SOL);
const RECIPIENT_RENT_LAMPORTS = Math.ceil(RECIPIENT_RENT * LAMPORTS_PER_SOL);
const ATA_RENT_LAMPORTS = Math.ceil(ATA_RENT);

const HPL_CRONS_PROGRAM_ID = new PublicKey(
  "hcrLPFgFUY6sCUKzqLWxXx5bntDiDCrAZVcrXfx9AHu",
);
import { TASK_QUEUE_ID } from "@/lib/constants/tuktuk";

/**
 * Create transactions to claim rewards for all hotspots in a wallet.
 * For wallets with 3 or fewer hotspots, returns direct claim transactions.
 * For larger wallets, creates a Tuktuk task to process claims.
 */
export const claimRewards = publicProcedure.hotspots.claimRewards.handler(
  async ({ input, errors }) => {
    const { walletAddress } = input;

    // Single query: fetch up to 3 hotspots and total count
    const hotspotsData = await getHotspotsByOwner({
      owner: walletAddress,
      page: 1,
      limit: 3,
    });
    const { total } = hotspotsData;

    // For small wallets, request direct claim transactions
    if (total <= 3) {
      // Initialize programs
      const { provider, connection } = createSolanaConnection(walletAddress);
      const ldProgram = await initLd(provider);
      const mfProgram = await initMiniFanout(provider);

      // Map hotspots to asset/entityKey pairs
      const allHotspots = hotspotsData.hotspots.map((h) => ({
        asset: new PublicKey(h.asset),
        entityKey: h.entityKey,
      }));

      // Filter out hotspots with mini fanout destinations
      const lazyDistributor = new PublicKey(HNT_LAZY_DISTRIBUTOR_ADDRESS);
      const { claimable } = await filterHotspotsWithoutMiniFanout(
        ldProgram,
        mfProgram,
        connection,
        lazyDistributor,
        allHotspots,
      );

      // If all hotspots have mini fanouts, return empty transactions
      if (claimable.length === 0) {
        return {
          transactionData: {
            transactions: [],
            parallel: true,
            tag: `claim_rewards:${walletAddress}`,
            actionMetadata: { type: "claim_rewards", hotspotCount: 0, network: "all" },
          },
          estimatedSolFee: toTokenAmountOutput(
            new BN(0),
            NATIVE_MINT.toBase58(),
          ),
        };
      }

      const assets = claimable.map((h) => h.asset);
      const entityKeys = claimable.map((h) => h.entityKey);

      // Fetch oracle rewards for these entity keys
      const rewards = await getBulkRewards(
        ldProgram,
        lazyDistributor,
        entityKeys,
      );

      // Build and sign transactions via oracle
      const vtxs: VersionedTransaction[] = await formBulkTransactions({
        program: ldProgram,
        rewards,
        assets,
        lazyDistributor,
        assetEndpoint: env.ASSET_ENDPOINT,
        isDevnet: getCluster() === "devnet",
        useCache: false,
        skipOracleSign: false,
      });

      // Add Jito tip if needed for mainnet bundles
      if (shouldUseJitoBundle(vtxs.length, getCluster())) {
        vtxs.push(await getJitoTipTransaction(new PublicKey(walletAddress)));
      }

      const txs = vtxs.map((tx) =>
        Buffer.from(tx.serialize()).toString("base64"),
      );

      const txFees = getTotalTransactionFees(vtxs);

      // Check wallet has sufficient balance for tx fees + recipient creation rent
      const recipientKeys = assets.map(
        (asset) => recipientKey(lazyDistributor, asset)[0],
      );
      const recipientAccounts =
        await ldProgram.account.recipientV0.fetchMultiple(recipientKeys);
      const numRecipientsNeeded = recipientAccounts.filter((r) => !r).length;
      const rentCost = numRecipientsNeeded * RECIPIENT_RENT_LAMPORTS;
      const requiredLamports = calculateRequiredBalance(txFees, rentCost);
      const senderBalance = await connection.getBalance(
        new PublicKey(walletAddress),
      );
      if (senderBalance < requiredLamports) {
        throw errors.INSUFFICIENT_FUNDS({
          message: "Insufficient SOL balance to claim rewards",
          data: {
            available: senderBalance,
            required: requiredLamports,
          },
        });
      }

      return {
        transactionData: {
          transactions: txs.map((serialized, i) => ({
            serializedTransaction: serialized,
            metadata: {
              type: "claim_rewards",
              description: "Claim hotspot rewards",
              hotspotKeys: claimable.map((h) => h.asset.toBase58()),
            },
          })),
          parallel: true,
          tag: `claim_rewards:${walletAddress}`,
          actionMetadata: { type: "claim_rewards", hotspotCount: claimable.length, network: "all" },
        },
        estimatedSolFee: toTokenAmountOutput(
          new BN(txFees + rentCost),
          NATIVE_MINT.toBase58(),
        ),
      };
    }

    // For larger wallets, queue a Tuktuk claim task via HPL Crons
    const { provider } = createSolanaConnection(walletAddress);
    anchor.setProvider(provider);

    const tuktukProgram = await initTuktuk(provider);
    const taskQueueAcc =
      await tuktukProgram.account.taskQueueV0.fetch(TASK_QUEUE_ID);
    const [taskId] = nextAvailableTaskIds(taskQueueAcc.taskBitmap, 1);

    const queueAuthority = PublicKey.findProgramAddressSync(
      [Buffer.from("queue_authority")],
      HPL_CRONS_PROGRAM_ID,
    )[0];

    const idl = await anchor.Program.fetchIdl(HPL_CRONS_PROGRAM_ID, provider);
    const hplCronsProgram = new anchor.Program(
      idl as anchor.Idl,
      provider,
    ) as anchor.Program<anchor.Idl>;

    const instructions: TransactionInstruction[] = [];

    const pdaWallet = customSignerKey(TASK_QUEUE_ID, [
      Buffer.from("claim_payer"),
      new PublicKey(walletAddress).toBuffer(),
    ])[0];
    const pdaWalletBalanceLamports =
      await provider.connection.getBalance(pdaWallet);
    const ata = getAssociatedTokenAddressSync(
      HNT_MINT,
      new PublicKey(walletAddress),
      true,
    );
    const minCrankReward = taskQueueAcc?.minCrankReward?.toNumber() || 10000;
    const account = await provider.connection.getAccountInfo(ata);
    const pdaWalletFundingNeededLamports =
      MIN_RENT_LAMPORTS +
      (account ? 0 : ATA_RENT_LAMPORTS) +
      // Actual claim txs
      20000 * (total || 1) +
      // Requeue transactions (5 queues per tx)
      minCrankReward * Math.ceil((total || 1) / 5);
    const pdaWalletLamportsShortfall = Math.max(
      0,
      pdaWalletFundingNeededLamports - pdaWalletBalanceLamports,
    );

    const hotspotsNeedingRecipient =
      await getNumRecipientsNeeded(walletAddress);
    console.log(
      `[PDA WALLET ${pdaWallet.toBase58()}] Hotspots needing recipient: ${hotspotsNeedingRecipient}, shortfall: ${pdaWalletLamportsShortfall}`,
    );

    if (pdaWalletLamportsShortfall > 0 || hotspotsNeedingRecipient > 0) {
      const requiredLamports =
        pdaWalletLamportsShortfall +
        hotspotsNeedingRecipient * RECIPIENT_RENT_LAMPORTS;
      // Ensure the user's wallet has enough SOL to fund PDA and recipients before returning tx
      const senderBalance = await provider.connection.getBalance(
        new PublicKey(walletAddress),
      );
      const totalRequired = calculateRequiredBalance(
        BASE_TX_FEE_LAMPORTS,
        requiredLamports,
      );
      if (senderBalance < totalRequired) {
        throw errors.INSUFFICIENT_FUNDS({
          message: "Insufficient SOL balance to fund claim task",
          data: {
            available: senderBalance,
            required: totalRequired,
          },
        });
      }
      instructions.push(
        SystemProgram.transfer({
          fromPubkey: new PublicKey(walletAddress),
          toPubkey: pdaWallet,
          lamports: requiredLamports,
        }),
      );
    }

    const ix = await hplCronsProgram.methods
      .queueWalletClaimV0({ freeTaskId: taskId })
      .accountsStrict({
        task: taskKey(TASK_QUEUE_ID, taskId)[0],
        wallet: new PublicKey(walletAddress),
        taskQueue: TASK_QUEUE_ID,
        payer: provider.wallet.publicKey,
        systemProgram: SystemProgram.programId,
        queueAuthority,
        tuktukProgram: tuktukProgram.programId,
        pdaWallet: customSignerKey(TASK_QUEUE_ID, [
          Buffer.from("claim_payer"),
          new PublicKey(walletAddress).toBuffer(),
        ])[0],
        taskQueueAuthority: taskQueueAuthorityKey(
          TASK_QUEUE_ID,
          queueAuthority,
        )[0],
      })
      .instruction();

    instructions.push(ix);
    const vtxs = (
      await batchInstructionsToTxsWithPriorityFee(provider, instructions, {
        addressLookupTableAddresses: [
          process.env.NEXT_PUBLIC_SOLANA_CLUSTER?.trim() === "devnet"
            ? HELIUM_COMMON_LUT_DEVNET
            : HELIUM_COMMON_LUT,
        ],
      })
    ).map((tx) => toVersionedTx(tx));

    // Add Jito tip if needed for mainnet bundles
    if (shouldUseJitoBundle(vtxs.length, getCluster())) {
      vtxs.push(await getJitoTipTransaction(new PublicKey(walletAddress)));
    }

    const txs: Array<string> = vtxs.map((tx) =>
      Buffer.from(tx.serialize()).toString("base64"),
    );

    // For Tuktuk claims: tx fees + PDA wallet funding + recipient rent
    const txFees = getTotalTransactionFees(vtxs);
    const rentCost =
      pdaWalletLamportsShortfall +
      hotspotsNeedingRecipient * RECIPIENT_RENT_LAMPORTS;

    return {
      transactionData: {
        transactions: txs.map((serialized) => ({
          serializedTransaction: serialized,
          metadata: {
            type: "queue_wallet_claim",
            description: "Queue wallet claim task via Tuktuk",
            taskIds: [taskId],
          },
        })),
        parallel: true,
        tag: `claim_rewards_tuktuk:${walletAddress}`,
        actionMetadata: { type: "queue_wallet_claim", hotspotCount: total, network: "all" },
      },
      estimatedSolFee: toTokenAmountOutput(
        new BN(txFees + rentCost),
        NATIVE_MINT.toBase58(),
      ),
    };
  },
);
