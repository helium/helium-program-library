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
import { getAssociatedTokenAddressSync } from "@solana/spl-token";
import { getJitoTipAmountLamports, getJitoTipTransaction, shouldUseJitoBundle } from "@/lib/utils/jito";
import {
  getTotalTransactionFees,
  calculateRequiredBalance,
  BASE_TX_FEE_LAMPORTS,
} from "@/lib/utils/balance-validation";
import { toTokenAmountOutput } from "@/lib/utils/token-math";
import { NATIVE_MINT } from "@solana/spl-token";
import BN from "bn.js";
import { getMintForNetwork, getLazyDistributorForNetwork } from "@/lib/utils/network-mint";

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

// Max hotspots to process per direct claim call for non-HNT networks
const MAX_DIRECT_CLAIM_HOTSPOTS = 4;

/**
 * Create transactions to claim rewards for all hotspots in a wallet.
 * For HNT: wallets with ≤3 hotspots get direct claim, larger wallets use Tuktuk.
 * For IOT/MOBILE: always uses direct claim with hasMore pagination for large wallets.
 */
export const claimRewards = publicProcedure.hotspots.claimRewards.handler(
  async ({ input, errors }) => {
    const { walletAddress, network } = input;
    const mint = getMintForNetwork(network);
    const lazyDistributor = getLazyDistributorForNetwork(network);
    const lazyDistributorAddress = lazyDistributor.toBase58();
    const isHnt = network === "hnt";

    // For non-HNT, fetch more hotspots since we use direct claim
    const limit = isHnt ? 3 : MAX_DIRECT_CLAIM_HOTSPOTS;
    const hotspotsData = await getHotspotsByOwner({
      owner: walletAddress,
      page: 1,
      limit,
    });
    const { total } = hotspotsData;

    // Use direct claim path for: small wallets (any network) or non-HNT networks
    const useDirectClaim = !isHnt || total <= 3;

    if (useDirectClaim) {
      const { provider, connection } = createSolanaConnection(walletAddress);
      const ldProgram = await initLd(provider);
      const mfProgram = await initMiniFanout(provider);

      const matchesNetwork = (h: { type: string }) =>
        isHnt || h.type === network || h.type === "all";

      // Accumulate transactions across pages until we hit MAX_DIRECT_CLAIM_HOTSPOTS + 1
      // (the +1 lets us know there are more). Then slice off the extra and set hasMore.
      let allVtxs: VersionedTransaction[] = [];
      let allClaimable: Array<{ asset: PublicKey; entityKey: string }> = [];
      let currentPage = 1;
      const totalPages = Math.ceil(total / limit);

      while (allVtxs.length <= MAX_DIRECT_CLAIM_HOTSPOTS && currentPage <= totalPages) {
        // Step 1: Fetch a chunk of hotspots, filter by network
        const pageData = currentPage === 1
          ? hotspotsData
          : await getHotspotsByOwner({ owner: walletAddress, page: currentPage, limit });
        currentPage++;

        const pageHotspots = pageData.hotspots
          .filter(matchesNetwork)
          .map((h) => ({ asset: new PublicKey(h.asset), entityKey: h.entityKey }));

        if (pageHotspots.length === 0) continue;

        // Step 2: Filter for ones with pending rewards
        const entityKeys = pageHotspots.map((h) => h.entityKey);
        const rewards = await getBulkRewards(ldProgram, lazyDistributor, entityKeys);
        const rKeys = pageHotspots.map((h) => recipientKey(lazyDistributor, h.asset)[0]);
        const recipientAccs = await ldProgram.account.recipientV0.fetchMultiple(rKeys);
        const withPending = pageHotspots.filter((_, idx) => {
          const sortedOracleRewards = rewards
            .map((rew) => new BN(rew.currentRewards[entityKeys[idx]] || 0))
            .sort((a, b) => a.sub(b).toNumber());
          const oracleMedian = sortedOracleRewards[Math.floor(sortedOracleRewards.length / 2)];
          const alreadyDistributed = recipientAccs[idx]?.totalRewards || new BN(0);
          return oracleMedian.sub(alreadyDistributed).gtn(0);
        });

        if (withPending.length === 0) continue;

        // Step 3: Filter out ones with mini-fanouts
        const { claimable: pageClaimable } = await filterHotspotsWithoutMiniFanout(
          ldProgram,
          mfProgram,
          connection,
          lazyDistributor,
          withPending,
        );

        if (pageClaimable.length === 0) continue;

        // Step 4: Build transactions
        const pageVtxs = await formBulkTransactions({
          program: ldProgram,
          rewards,
          assets: pageClaimable.map((h) => h.asset),
          lazyDistributor,
          assetEndpoint: env.ASSET_ENDPOINT,
          isDevnet: getCluster() === "devnet",
          useCache: false,
          skipOracleSign: false,
        });

        allVtxs.push(...pageVtxs);
        allClaimable.push(...pageClaimable);
      }

      // Step 5: Determine hasMore
      const hasMore = allVtxs.length > MAX_DIRECT_CLAIM_HOTSPOTS;
      if (hasMore) {
        allVtxs = allVtxs.slice(0, MAX_DIRECT_CLAIM_HOTSPOTS);
      }

      if (allVtxs.length === 0) {
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
          hasMore: false,
        };
      }

      if (shouldUseJitoBundle(allVtxs.length, getCluster())) {
        allVtxs.push(await getJitoTipTransaction(new PublicKey(walletAddress)));
      }

      const txs = allVtxs.map((tx) =>
        Buffer.from(tx.serialize()).toString("base64"),
      );

      const txFees = getTotalTransactionFees(allVtxs);
      const assets = allClaimable.map((h) => h.asset);

      const recipientKeys = assets.map(
        (asset) => recipientKey(lazyDistributor, asset)[0],
      );
      const recipientAccounts =
        await ldProgram.account.recipientV0.fetchMultiple(recipientKeys);
      const numRecipientsNeeded = recipientAccounts.filter((r) => !r).length;
      const jitoTipCost = shouldUseJitoBundle(allVtxs.length, getCluster())
        ? getJitoTipAmountLamports()
        : 0;
      const estimatedResizeCost = assets.length * 200_000;
      const rentCost = numRecipientsNeeded * RECIPIENT_RENT_LAMPORTS;
      const requiredLamports = calculateRequiredBalance(
        txFees + jitoTipCost + estimatedResizeCost,
        rentCost,
      );
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
              hotspotKeys: allClaimable.map((h) => h.asset.toBase58()),
            },
          })),
          parallel: true,
          tag: `claim_rewards:${walletAddress}`,
          actionMetadata: { type: "claim_rewards", hotspotCount: allClaimable.length, network: "all" },
        },
        estimatedSolFee: toTokenAmountOutput(
          new BN(txFees + rentCost),
          NATIVE_MINT.toBase58(),
        ),
        hasMore,
      };
    }

    // HNT with >3 hotspots: queue a Tuktuk claim task via HPL Crons
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
      await getNumRecipientsNeeded(walletAddress, lazyDistributorAddress);
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
      const tuktukJitoTipCost =
        getCluster() === "mainnet" || getCluster() === "mainnet-beta"
          ? getJitoTipAmountLamports()
          : 0;
      const totalRequired = calculateRequiredBalance(
        BASE_TX_FEE_LAMPORTS + tuktukJitoTipCost,
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
        commitment: "finalized",
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
      hasMore: false,
    };
  },
);
