import { createSolanaConnection, getCluster } from "@/lib/solana";
import {
  calculateCronJobCostPerClaim,
  estimateAutomationFunding,
  getBaseAutomationRentLamports,
  getRequeueTaskRentLamports,
  ENTITY_CLAIM_CRON_NAME,
  requeuesCronJob as requeuesCronJobFor,
  resolveScheduleToCron,
  scheduleChanged,
  setupBundleLimitMessage,
} from "@/lib/utils/automation-helpers";
import * as anchor from "@anchor-lang/core";
import type { AutomationClaims } from "@helium/blockchain-api";
import {
  cronJobKey,
  cronJobNameMappingKey,
  cronJobTransactionKey,
  init as initCron,
} from "@helium/cron-sdk";
import { keyToAssetKey } from "@helium/helium-entity-manager-sdk";
import { daoKey } from "@helium/helium-sub-daos-sdk";
import {
  entityCronAuthorityKey,
  HNT_REWARDS_ORACLE_URL,
  HNT_REWARDS_ORACLE_URL_DEVNET,
  init as initHplCrons,
  remoteCronTransactionSpace,
} from "@helium/hpl-crons-sdk";
import {
  batchInstructionsToTxsWithPriorityFee,
  HNT_MINT,
  toVersionedTx,
  WALLET_SIGNED,
} from "@helium/spl-utils";
import { init as initTuktuk } from "@helium/tuktuk-sdk";
import {
  Connection,
  PublicKey,
  SystemProgram,
  TransactionInstruction,
} from "@solana/web3.js";
import {
  getRentLamports,
  getTotalTransactionFees,
} from "@/lib/utils/balance-validation";
import { toTokenAmountOutput } from "@/lib/utils/token-math";
import { getHeliumLookupTable } from "@/lib/utils/build-transaction";
import { NATIVE_MINT } from "@solana/spl-token";
import BN from "bn.js";
import {
  getJitoTipAmountLamports,
  getJitoTipTransaction,
  serializeWithTipMetadata,
  shouldUseJitoBundle,
} from "@/lib/utils/jito";
import {
  buildTeardownInstructions,
  fetchAutomationData,
  nextFreeTaskKey,
  teardownAccountsRefundLamports,
} from "./automation-data-helpers";
import { TASK_QUEUE_ID } from "@/lib/constants/tuktuk";

export const HNT_DAO = daoKey(HNT_MINT)[0];

/**
 * Oracle URL hpl-crons writes into its claim transactions. The program
 * compiles it in per cluster (utils/shared-utils/src/lib.rs), so it does not
 * follow env.ORACLE_URL.
 */
const claimOracleUrl = (): string =>
  getCluster() === "devnet"
    ? HNT_REWARDS_ORACLE_URL_DEVNET
    : HNT_REWARDS_ORACLE_URL;

type CronClaimCounts = { numTransactions: number; nextTransactionId: number };

/**
 * A setup adds claims only to a cron it creates, or to an existing cron with
 * no claims. On the same schedule, a cron that already has claims keeps them
 * and is only funded, so a repeated setup does not add duplicates. A schedule
 * change tears down every claim; the new cron gets only the requested claims.
 */
const setupAddsClaims = (
  cronJobAccount: CronClaimCounts | null,
  recreatesCronJob: boolean
): boolean => recreatesCronJob || cronJobAccount?.numTransactions === 0;

/**
 * Price the claims a setup adds: the rent of each claim's cron transaction,
 * and the cron job's cost per run with the added claims. The cost counts
 * claims with nextTransactionId, the same as fetchAutomationData. Returns
 * undefined when the setup adds no claims.
 */
export const priceSetupClaims = async ({
  connection,
  wallet,
  claims,
  cronJobAccount,
  recreatesCronJob,
  minCrankReward,
}: {
  connection: Connection;
  wallet: PublicKey;
  claims: AutomationClaims | undefined;
  cronJobAccount: CronClaimCounts | null;
  recreatesCronJob: boolean;
  minCrankReward: number;
}) => {
  if (!claims || !setupAddsClaims(cronJobAccount, recreatesCronJob)) {
    return undefined;
  }
  // hpl-crons writes these URLs into each claim's cron transaction.
  const oracleUrl = claimOracleUrl();
  const urls =
    claims.kind === "wallet"
      ? [`${oracleUrl}/v1/tuktuk/wallet/${wallet.toBase58()}`]
      : claims.entityKeys.map(
          (entityKey) =>
            `${oracleUrl}/v1/tuktuk/kta/${keyToAssetKey(HNT_DAO, entityKey)[0].toBase58()}`
        );
  const rents = await Promise.all(
    urls.map((url) =>
      getRentLamports(connection, remoteCronTransactionSpace(url))
    )
  );
  const startIndex = recreatesCronJob
    ? 0
    : cronJobAccount?.nextTransactionId || 0;
  return {
    startIndex,
    claimRentLamports: rents.reduce((sum, rent) => sum + rent, 0),
    cronJobCostPerClaimLamports: calculateCronJobCostPerClaim(
      minCrankReward,
      startIndex + urls.length
    ),
  };
};

const buildClaimInstructions = async ({
  hplCronsProgram,
  wallet,
  authority,
  cronJob,
  claims,
  startIndex,
}: {
  hplCronsProgram: Awaited<ReturnType<typeof initHplCrons>>;
  wallet: PublicKey;
  authority: PublicKey;
  cronJob: PublicKey;
  claims: AutomationClaims;
  startIndex: number;
}): Promise<TransactionInstruction[]> => {
  // Pass every account so Anchor does not fetch a cron job that an earlier
  // instruction in this setup creates.
  const shared = (index: number) => ({
    payer: wallet,
    userAuthority: wallet,
    authority,
    cronJob,
    cronJobTransaction: cronJobTransactionKey(cronJob, index)[0],
  });
  if (claims.kind === "wallet") {
    return [
      await hplCronsProgram.methods
        .addWalletToEntityCronV0({ index: startIndex })
        .accountsPartial({ ...shared(startIndex), wallet })
        .instruction(),
    ];
  }
  return Promise.all(
    claims.entityKeys.map((entityKey, i) =>
      hplCronsProgram.methods
        .addEntityToCronV0({ index: startIndex + i })
        .accountsPartial({
          ...shared(startIndex + i),
          keyToAsset: keyToAssetKey(HNT_DAO, entityKey)[0],
        })
        .instruction()
    )
  );
};

/**
 * Build the transactions that set up (or re-schedule) a wallet's claim
 * automation, fund it for `duration` runs and, when `claims` is given, add
 * those claims (see setupAddsClaims). A claim setup whose transactions do not
 * fit one mainnet Jito bundle throws BAD_REQUEST, because they could land in
 * part. It applies the mainnet limit on every cluster.
 */
export const buildAutomationSetup = async ({
  walletAddress,
  schedule,
  duration,
  claims,
  errors,
}: {
  walletAddress: string;
  schedule: string;
  duration: number;
  claims?: AutomationClaims;
  errors: {
    INSUFFICIENT_FUNDS: (opts: {
      message: string;
      data: { required: number; available: number };
    }) => Error;
    BAD_REQUEST: (opts: { message: string }) => Error;
  };
}) => {
  // Accept a preset (daily/weekly/monthly) or a raw crontab; presets map to
  // a crontab here so everything downstream deals in a single cron string.
  const cronSchedule = resolveScheduleToCron(schedule);

  const wallet = new PublicKey(walletAddress);
  const { provider } = createSolanaConnection(walletAddress);
  anchor.setProvider(provider);

  // Initialize programs
  const hplCronsProgram = await initHplCrons(provider);
  const cronProgram = await initCron(provider);
  const tuktukProgram = await initTuktuk(provider);

  // Derive keys. hpl_crons pins a single entity-claim cron per wallet
  // (id 0, name "entity_claim"), so both are fixed.
  const authority = entityCronAuthorityKey(wallet)[0];
  const cronJob = cronJobKey(authority, 0)[0];

  const cronJobAccount =
    await cronProgram.account.cronJobV0.fetchNullable(cronJob);

  const instructions: TransactionInstruction[] = [];

  // If cronJob doesn't exist or schedule changed, create/recreate it
  const recreatesCronJob =
    !cronJobAccount ||
    (!!cronJobAccount.schedule &&
      scheduleChanged(cronJobAccount.schedule, schedule));
  const requeuesCronJob = requeuesCronJobFor(cronJobAccount, recreatesCronJob);
  if (recreatesCronJob) {
    // If it exists but schedule changed, remove it first. Skip holes left
    // by individually-removed claims (nextTransactionId is monotonic).
    if (cronJobAccount) {
      instructions.push(
        ...(await buildTeardownInstructions(
          provider.connection,
          hplCronsProgram,
          cronJob,
          authority,
          wallet,
          cronJobAccount.nextTransactionId || 0
        ))
      );
    }

    // Create new cron job. Fetch the task queue fresh to get the latest state.
    const freshTask = await nextFreeTaskKey(tuktukProgram);

    instructions.push(
      await hplCronsProgram.methods
        .initEntityClaimCronV0({
          schedule: cronSchedule,
        })
        .accounts({
          taskQueue: TASK_QUEUE_ID,
          cronJob,
          task: freshTask,
          cronJobNameMapping: cronJobNameMappingKey(
            authority,
            ENTITY_CLAIM_CRON_NAME
          )[0],
        })
        .instruction()
    );
  } else if (requeuesCronJob) {
    // If cron exists but was removed from queue due to insufficient SOL,
    // requeue it. Fetch the task queue fresh to get the latest state.
    const freshTask = await nextFreeTaskKey(tuktukProgram);

    instructions.push(
      await hplCronsProgram.methods
        .requeueEntityClaimCronV0()
        .accounts({
          taskQueue: TASK_QUEUE_ID,
          cronJob,
          task: freshTask,
          cronJobNameMapping: cronJobNameMappingKey(
            authority,
            ENTITY_CLAIM_CRON_NAME
          )[0],
        })
        .instruction()
    );
  }

  // fetchAutomationData always returns a valid object, even if cron job doesn't exist
  const {
    cronJobBalanceLamports,
    cronJobRentLamports,
    pdaWalletBalanceLamports,
    cronJobCostPerClaimLamports,
    pdaWalletCostPerClaimLamports,
    recipientRentLamports,
    pdaWalletRentLamports,
    ataRentLamports,
    taskReturnAccountFundingLamports,
    minCrankReward,
    pdaWallet,
  } = await fetchAutomationData(walletAddress, provider);

  const claimPricing = await priceSetupClaims({
    connection: provider.connection,
    wallet,
    claims,
    cronJobAccount,
    recreatesCronJob,
    minCrankReward,
  });
  if (claims && claimPricing) {
    instructions.push(
      ...(await buildClaimInstructions({
        hplCronsProgram,
        wallet,
        authority,
        cronJob,
        claims,
        startIndex: claimPricing.startIndex,
      }))
    );
  }
  const claimRentLamports = claimPricing?.claimRentLamports ?? 0;

  // Price with the same helper as getFundingEstimate. When init runs (first
  // setup or a schedule change) init_entity_claim_cron_v0 pays the base
  // rent and the schedule task's crank reward from the wallet, so the cron
  // job transfer below carries neither and the total counts them once. The
  // new cron job starts empty, so it is funded for the whole duration. A
  // requeue pays a new schedule task's rent and crank reward from the wallet.
  const { cronJobFundingLamports, pdaWalletFundingLamports, totalLamports } =
    estimateAutomationFunding({
      cronJobExists: !recreatesCronJob,
      baseAutomationRentLamports: recreatesCronJob
        ? await getBaseAutomationRentLamports(
            provider.connection,
            cronSchedule.length
          )
        : 0,
      minCrankRewardLamports: minCrankReward,
      requeueTaskRentLamports: requeuesCronJob
        ? await getRequeueTaskRentLamports(provider.connection)
        : undefined,
      cronJobBalanceLamports,
      // Each claim the setup adds raises the cron job's cost per run.
      cronJobCostPerClaimLamports:
        claimPricing?.cronJobCostPerClaimLamports ??
        cronJobCostPerClaimLamports,
      pdaWalletBalanceLamports,
      pdaWalletCostPerClaimLamports,
      recipientRentLamports,
      cronJobRentLamports,
      pdaWalletRentLamports,
      additionalDuration: duration,
      ataRentLamports,
      taskReturnAccountFundingLamports,
    });

  // Always add at least minimal funding to ensure transaction is created
  const minCrankSolFee = Math.max(0, cronJobFundingLamports);
  const minPdaWalletSolFee = Math.max(0, pdaWalletFundingLamports);

  // The claim instructions pay their cron transactions' rent from the wallet.
  const totalFundingNeeded = totalLamports + claimRentLamports;

  if (minCrankSolFee > 0) {
    instructions.push(
      SystemProgram.transfer({
        fromPubkey: wallet,
        toPubkey: cronJob,
        lamports: minCrankSolFee,
      })
    );
  }

  if (minPdaWalletSolFee > 0) {
    instructions.push(
      SystemProgram.transfer({
        fromPubkey: wallet,
        toPubkey: pdaWallet,
        lamports: minPdaWalletSolFee,
      })
    );
  }

  // Build and serialize transactions
  const vtxs = await Promise.all(
    (
      await batchInstructionsToTxsWithPriorityFee(provider, instructions, {
        addressLookupTableAddresses: [getHeliumLookupTable()],
        commitment: "finalized",
        signing: WALLET_SIGNED,
      })
    ).map((tx) => toVersionedTx(tx))
  );
  // Transactions past one bundle could land in part: a schedule change could
  // leave the new cron without its claims, or only some hotspots get added.
  const bundleLimitMessage = setupBundleLimitMessage({
    claimsKind: claims?.kind,
    tearsDown: !!cronJobAccount && recreatesCronJob,
    txCount: vtxs.length,
  });
  if (bundleLimitMessage) {
    throw errors.BAD_REQUEST({ message: bundleLimitMessage });
  }

  // Add Jito tip if needed for mainnet bundles
  const useJito = shouldUseJitoBundle(vtxs.length, getCluster());
  if (useJito) {
    vtxs.push(await getJitoTipTransaction(wallet));
  }

  // Estimated fee includes tx fees + setup rent and crank reward + claim rent
  // + operational funding (cronJob + pdaWallet)
  const txFees = await getTotalTransactionFees(provider.connection, vtxs);

  // Check wallet has sufficient balance (same pattern as fundAutomation).
  const walletBalance = await provider.connection.getBalance(wallet);
  const cluster = getCluster();
  const estimatedJitoTipCost =
    cluster === "mainnet" || cluster === "mainnet-beta"
      ? getJitoTipAmountLamports()
      : 0;
  const totalNeededWithFees =
    totalFundingNeeded + txFees + estimatedJitoTipCost;

  // The teardown runs before init and the transfers, so the old cron job's,
  // its cron transactions', its name mapping's and its task return accounts'
  // (task_return_account_1 and task_return_account_2) lamports are back in the
  // wallet by the time they spend. Lamports donated to a cron job PDA with no
  // data get no teardown, so they never come back.
  const teardownRefundLamports =
    cronJobAccount && recreatesCronJob
      ? cronJobBalanceLamports +
        (await teardownAccountsRefundLamports(
          provider.connection,
          cronJob,
          authority,
          cronJobAccount.nextTransactionId || 0
        ))
      : 0;

  if (walletBalance + teardownRefundLamports < totalNeededWithFees) {
    throw errors.INSUFFICIENT_FUNDS({
      message: "Insufficient SOL balance to set up automation",
      data: {
        required: totalNeededWithFees,
        available: walletBalance + teardownRefundLamports,
      },
    });
  }

  const estimatedSolFeeLamports = txFees + totalFundingNeeded;
  const effectiveSchedule = recreatesCronJob
    ? cronSchedule
    : cronJobAccount!.schedule;
  // Only the claim setups report which claims they added.
  const claimMetadata = claims
    ? {
        claims: claims.kind,
        claimsAdded: claimPricing
          ? claims.kind === "wallet"
            ? 1
            : claims.entityKeys.length
          : 0,
      }
    : {};

  return {
    response: {
      transactionData: {
        transactions: serializeWithTipMetadata(
          vtxs,
          {
            type: "setup_automation",
            description: "Set up hotspot claim automation",
            cronSchedule: effectiveSchedule,
            duration,
            ...claimMetadata,
          },
          useJito
        ),
        parallel: false,
        tag: `setup_automation:${walletAddress}`,
        actionMetadata: {
          type: "setup_automation",
          cronSchedule: effectiveSchedule,
          duration,
          ...claimMetadata,
        },
      },
      estimatedSolFee: await toTokenAmountOutput(
        new BN(estimatedSolFeeLamports),
        NATIVE_MINT.toBase58()
      ),
    },
  };
};
