import * as anchor from "@coral-xyz/anchor";
import * as client from "@helium/distributor-oracle";
import {
  init as initHem,
  keyToAssetForAsset,
  rewardableEntityConfigKey,
  iotInfoKey,
  mobileInfoKey,
  decodeEntityKey,
} from "@helium/helium-entity-manager-sdk";
import { daoKey, subDaoKey } from "@helium/helium-sub-daos-sdk";
import {
  init as initLazy,
  lazyDistributorKey,
  recipientKey,
} from "@helium/lazy-distributor-sdk";
import { init as initRewards } from "@helium/rewards-oracle-sdk";
import { init as initMem } from "@helium/mobile-entity-manager-sdk";
import {
  HNT_MINT,
  MOBILE_MINT,
  IOT_MINT,
  getAssetsByGroup,
  batchInstructionsToTxsWithPriorityFee,
  bulkSendTransactions,
  bulkSendRawTransactions,
  chunks,
  truthy,
  humanReadable,
} from "@helium/spl-utils";
import { PublicKey, TransactionInstruction } from "@solana/web3.js";
import BN from "bn.js";
import os from "os";
import pLimit from "p-limit";
import yargs from "yargs/yargs";
import { loadKeypair } from "./utils";

// Token decimals
const MOBILE_DECIMALS = 6;
const HNT_DECIMALS = 8;
const DAS_BATCH_SIZE = 1000;
// Process batch size reduced to prevent OOM with large datasets
const PROCESS_BATCH_SIZE = 5000;

// Helper to format token amounts
const toMobile = (amount: BN) => humanReadable(amount, MOBILE_DECIMALS);
const toHnt = (amount: BN) => humanReadable(amount, HNT_DECIMALS);

// Hardcoded key_to_asset addresses from initial migration that need special handling
// These can be closed even if they have iot_info or mobile_info accounts
const HARDCODED_KEY_TO_ASSETS = [
  // new PublicKey("AcKpRTmy6YKpQaWfLDBUaduQU1kHhNVLrPkW3TmEEqsc"),
  new PublicKey("3stUgrUq4j5BbamGdy7X2Y3dee24EeY5u1F7RHrrmaoP"),
  new PublicKey("4v7nfEN2Wj342Zm6V1Jwk9i5YCUHu6zBAJFENk6Gxzvr"),
  new PublicKey("2RtR6aVt6QgCSdV8LEH6ogWtDXGJpL73aB72DevJKgFC"),
];

// Type definitions
type KeyToAssetInfo = {
  keyToAsset: PublicKey;
  assetId: PublicKey;
  entityKey: Buffer;
  isHardcoded: boolean;
};

type AssetWithRecipients = KeyToAssetInfo & {
  hasMobileRecipient: boolean;
  hasHntRecipient: boolean;
};

type RunningTotals = {
  claimedMobile: BN;
  claimedHnt: BN;
  claimedTransactions: number;
  closedAccounts: number;
  batchesProcessed: number;
};

type ProblematicAsset = {
  asset: PublicKey;
  keyToAsset: PublicKey;
};

// Retry wrapper for DAS calls with exponential backoff
async function getAssetsWithRetry(
  endpoint: string,
  params: any,
  maxRetries = 5
) {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await getAssetsByGroup(endpoint, params);
    } catch (err: any) {
      if (attempt === maxRetries - 1) {
        throw err;
      }
      const delay = Math.min(2000 * Math.pow(2, attempt), 30000);
      const errorMsg = err.message || err.toString();
      console.log(
        `    Error: ${errorMsg.substring(0, 80)}... retrying in ${
          delay / 1000
        }s (attempt ${attempt + 1}/${maxRetries})`
      );
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  throw new Error("Max retries exceeded");
}

async function fetchRecipientsWithRetry(
  lazyProgram: any,
  chunk: PublicKey[],
  maxRetries = 3
) {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const accountInfos = await lazyProgram.account.recipientV0.fetchMultiple(
        chunk
      );
      return accountInfos;
    } catch (err: any) {
      if (attempt === maxRetries - 1) throw err;
      const delay = Math.min(1000 * Math.pow(2, attempt), 5000);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  throw new Error("Max retries exceeded");
}

async function formBulkTransactionsWithRetry(
  lazyProgram: any,
  rewardsOracleProgram: any,
  assets: PublicKey[],
  lazyDistributor: PublicKey,
  lazyDistributorAcc: any,
  mergedBulkRewards: client.BulkRewards[],
  wallet: PublicKey,
  problematicAssets: Map<string, ProblematicAsset>,
  assetToKeyToAsset: Map<string, PublicKey>,
  maxRetries = 5
): Promise<any[]> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await client.formBulkTransactions({
        program: lazyProgram,
        rewardsOracleProgram: rewardsOracleProgram,
        rewards: mergedBulkRewards,
        assets,
        lazyDistributor,
        lazyDistributorAcc,
        wallet,
      });
    } catch (err: any) {
      const errorMsg = err.message || err.toString();
      const is400 = errorMsg.includes("400");

      // For 400 errors with multiple assets, try splitting the batch
      if (is400 && assets.length > 1 && attempt === 0) {
        console.log(
          `    400 error with ${assets.length} assets, splitting batch...`
        );
        const mid = Math.floor(assets.length / 2);
        const first = assets.slice(0, mid);
        const second = assets.slice(mid);
        const [firstTxns, secondTxns] = await Promise.all([
          formBulkTransactionsWithRetry(
            lazyProgram,
            rewardsOracleProgram,
            first,
            lazyDistributor,
            lazyDistributorAcc,
            mergedBulkRewards,
            wallet,
            problematicAssets,
            assetToKeyToAsset,
            maxRetries
          ),
          formBulkTransactionsWithRetry(
            lazyProgram,
            rewardsOracleProgram,
            second,
            lazyDistributor,
            lazyDistributorAcc,
            mergedBulkRewards,
            wallet,
            problematicAssets,
            assetToKeyToAsset,
            maxRetries
          ),
        ]);
        return [...firstTxns, ...secondTxns];
      }

      // For single asset 400 errors, log, track, and skip
      if (is400 && assets.length === 1) {
        const asset = assets[0];
        const assetStr = asset.toBase58();
        const keyToAsset = assetToKeyToAsset.get(assetStr);
        console.error(`    Skipping problematic asset: ${assetStr}`);
        if (keyToAsset) {
          problematicAssets.set(assetStr, { asset, keyToAsset });
        }
        return [];
      }

      // For transient errors, retry with backoff
      if (attempt < maxRetries - 1) {
        const delay = Math.min(2000 * Math.pow(2, attempt), 30000);
        console.log(
          `    Error: ${errorMsg.substring(0, 80)}... retrying in ${
            delay / 1000
          }s (attempt ${attempt + 1}/${maxRetries})`
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }

      throw err;
    }
  }
  throw new Error("Max retries exceeded");
}

// Helper: Claim all rewards for a batch of assets
async function claimRewardsForBatch(
  assetsWithRecipients: AssetWithRecipients[],
  lazyProgram: any,
  rewardsOracleProgram: any,
  mobileLazyDistributor: PublicKey,
  hntLazyDistributor: PublicKey,
  authority: anchor.web3.Keypair,
  provider: anchor.AnchorProvider,
  commit: boolean,
  problematicAssets: Map<string, ProblematicAsset>
): Promise<{
  claimedMobile: BN;
  claimedHnt: BN;
  transactions: number;
  verifiedNoRewards: Set<string>;
}> {
  let totalClaimedMobile = new BN(0);
  let totalClaimedHnt = new BN(0);
  let totalTransactions = 0;
  // Track assets that have been verified to have 0 remaining rewards
  const verifiedNoRewards = new Set<string>();

  if (assetsWithRecipients.length === 0) {
    return {
      claimedMobile: totalClaimedMobile,
      claimedHnt: totalClaimedHnt,
      transactions: 0,
      verifiedNoRewards,
    };
  }

  // Fetch lazy distributor accounts once
  const [mobileLazyDistributorAcc, hntLazyDistributorAcc] = await Promise.all([
    lazyProgram.account.lazyDistributorV0.fetch(mobileLazyDistributor),
    lazyProgram.account.lazyDistributorV0.fetch(hntLazyDistributor),
  ]);

  // Build entity key map once (doesn't change between iterations)
  const entityKeyToAsset = new Map<
    string,
    {
      assetId: PublicKey;
      keyToAsset: PublicKey;
      entityKey: Buffer;
      hasMobileRecipient: boolean;
      hasHntRecipient: boolean;
    }
  >();

  // Also build asset -> keyToAsset map for tracking problematic assets
  const assetToKeyToAsset = new Map<string, PublicKey>();

  assetsWithRecipients.forEach(
    ({
      assetId,
      keyToAsset,
      entityKey,
      hasMobileRecipient,
      hasHntRecipient,
    }) => {
      const entityKeyStr = decodeEntityKey(entityKey, { b58: {} });
      if (entityKeyStr) {
        entityKeyToAsset.set(entityKeyStr, {
          assetId,
          keyToAsset,
          entityKey,
          hasMobileRecipient,
          hasHntRecipient,
        });
        assetToKeyToAsset.set(assetId.toBase58(), keyToAsset);
      }
    }
  );

  const entityKeys = Array.from(entityKeyToAsset.keys());
  const rewardsChunks = chunks(entityKeys, 5000);
  const rewardsLimiter = pLimit(5);
  const claimTxLimiter = pLimit(25);
  const dao = daoKey(HNT_MINT)[0];

  const MAX_CLAIM_ITERATIONS = 10;
  let claimIteration = 0;
  const ZERO = new BN(0);

  while (claimIteration < MAX_CLAIM_ITERATIONS) {
    claimIteration++;
    console.log(
      `  --- Claim Iteration ${claimIteration}/${MAX_CLAIM_ITERATIONS} ---`
    );

    // Get pending rewards using getPendingRewards (handles median + totalClaimed internally)
    let mobilePendingRewards: Record<string, string> = {};
    let hntPendingRewards: Record<string, string> = {};
    let rewardsFetchSucceeded = false;

    try {
      const pendingResults = await Promise.all([
        Promise.all(
          rewardsChunks.map((chunk) =>
            rewardsLimiter(async () => {
              try {
                return await client.getPendingRewards(
                  lazyProgram,
                  mobileLazyDistributor,
                  dao,
                  chunk,
                  "b58",
                  true // forceRequery
                );
              } catch (err: any) {
                console.error(
                  `Error fetching mobile pending rewards: ${err.message}`
                );
                return {};
              }
            })
          )
        ),
        Promise.all(
          rewardsChunks.map((chunk) =>
            rewardsLimiter(async () => {
              try {
                return await client.getPendingRewards(
                  lazyProgram,
                  hntLazyDistributor,
                  dao,
                  chunk,
                  "b58",
                  true // forceRequery
                );
              } catch (err: any) {
                console.error(
                  `Error fetching hnt pending rewards: ${err.message}`
                );
                return {};
              }
            })
          )
        ),
      ]);

      // Merge pending rewards from all chunks
      pendingResults[0].forEach((chunk) =>
        Object.assign(mobilePendingRewards, chunk)
      );
      pendingResults[1].forEach((chunk) =>
        Object.assign(hntPendingRewards, chunk)
      );
      rewardsFetchSucceeded =
        Object.keys(mobilePendingRewards).length > 0 ||
        Object.keys(hntPendingRewards).length > 0;
    } catch (err: any) {
      console.error(`Error fetching pending rewards: ${err.message}`);
    }

    // Find assets with actual pending rewards (> 0)
    let assetsWithRewards = 0;
    let totalPendingMobile = ZERO;
    let totalPendingHnt = ZERO;
    const assetsToClaimMobile: string[] = [];
    const assetsToClaimHnt: string[] = [];

    entityKeys.forEach((entityKey) => {
      const assetInfo = entityKeyToAsset.get(entityKey);
      if (!assetInfo) return;

      const pendingMobile = new BN(mobilePendingRewards[entityKey] || "0");
      const pendingHnt = new BN(hntPendingRewards[entityKey] || "0");
      const hasMobileRewards = pendingMobile.gt(ZERO);
      const hasHntRewards = pendingHnt.gt(ZERO);

      if (hasMobileRewards || hasHntRewards) {
        assetsWithRewards++;
        if (hasMobileRewards) {
          totalPendingMobile = totalPendingMobile.add(pendingMobile);
          assetsToClaimMobile.push(entityKey);
        }
        if (hasHntRewards) {
          totalPendingHnt = totalPendingHnt.add(pendingHnt);
          assetsToClaimHnt.push(entityKey);
        }
      }
    });

    console.log(
      `  Pending: ${assetsWithRewards} assets with ${toMobile(
        totalPendingMobile
      )} MOBILE and ${toHnt(totalPendingHnt)} HNT`
    );

    if (assetsWithRewards === 0) {
      if (!rewardsFetchSucceeded) {
        console.error(
          "  ⚠️  Failed to fetch rewards from oracles - cannot verify, skipping batch"
        );
        break;
      }

      // All assets in this batch now have 0 rewards - mark them as verified
      assetsWithRecipients.forEach((asset) => {
        if (!problematicAssets.has(asset.assetId.toBase58())) {
          verifiedNoRewards.add(asset.assetId.toBase58());
        }
      });
      console.log(
        `  ✓ All rewards claimed for this batch (${verifiedNoRewards.size} verified)`
      );
      break;
    }

    // Now fetch bulk rewards only for assets with pending > 0
    const mobileEntityKeysWithRewards = assetsToClaimMobile;
    const hntEntityKeysWithRewards = assetsToClaimHnt;

    let mergedMobileBulkRewards: client.BulkRewards[] = [];
    let mergedHntBulkRewards: client.BulkRewards[] = [];

    if (mobileEntityKeysWithRewards.length > 0) {
      const mobileChunks = chunks(mobileEntityKeysWithRewards, 5000);
      const mobileBulkResults = await Promise.all(
        mobileChunks.map((chunk) =>
          rewardsLimiter(() =>
            client.getBulkRewards(lazyProgram, mobileLazyDistributor, chunk)
          )
        )
      );
      // Merge bulk rewards
      if (mobileBulkResults.length > 0 && mobileBulkResults[0].length > 0) {
        const numOracles = mobileBulkResults[0].length;
        for (let oracleIdx = 0; oracleIdx < numOracles; oracleIdx++) {
          const mergedRewards: Record<string, string> = {};
          mobileBulkResults.forEach((bulkRewards) => {
            if (bulkRewards[oracleIdx]) {
              Object.assign(
                mergedRewards,
                bulkRewards[oracleIdx].currentRewards
              );
            }
          });
          mergedMobileBulkRewards.push({
            currentRewards: mergedRewards,
            oracleKey: mobileBulkResults[0][oracleIdx].oracleKey,
          });
        }
      }
    }

    if (hntEntityKeysWithRewards.length > 0) {
      const hntChunks = chunks(hntEntityKeysWithRewards, 5000);
      const hntBulkResults = await Promise.all(
        hntChunks.map((chunk) =>
          rewardsLimiter(() =>
            client.getBulkRewards(lazyProgram, hntLazyDistributor, chunk)
          )
        )
      );
      // Merge bulk rewards
      if (hntBulkResults.length > 0 && hntBulkResults[0].length > 0) {
        const numOracles = hntBulkResults[0].length;
        for (let oracleIdx = 0; oracleIdx < numOracles; oracleIdx++) {
          const mergedRewards: Record<string, string> = {};
          hntBulkResults.forEach((bulkRewards) => {
            if (bulkRewards[oracleIdx]) {
              Object.assign(
                mergedRewards,
                bulkRewards[oracleIdx].currentRewards
              );
            }
          });
          mergedHntBulkRewards.push({
            currentRewards: mergedRewards,
            oracleKey: hntBulkResults[0][oracleIdx].oracleKey,
          });
        }
      }
    }

    // Build assetsToClaim with oracle reward data
    const assetsToClaim: {
      asset: PublicKey;
      mobileRewards?: client.Reward[];
      hntRewards?: client.Reward[];
    }[] = [];

    // Use Sets for O(1) lookup instead of O(n) array.includes()
    const mobileRewardsSet = new Set(assetsToClaimMobile);
    const hntRewardsSet = new Set(assetsToClaimHnt);
    const allEntityKeysWithRewards = new Set([
      ...assetsToClaimMobile,
      ...assetsToClaimHnt,
    ]);

    allEntityKeysWithRewards.forEach((entityKey) => {
      const assetInfo = entityKeyToAsset.get(entityKey);
      if (!assetInfo) return;

      const hasMobileRewards = mobileRewardsSet.has(entityKey);
      const hasHntRewards = hntRewardsSet.has(entityKey);

      const mobileRewards: client.Reward[] | undefined = hasMobileRewards
        ? mergedMobileBulkRewards.map((oracle) => ({
            currentRewards: oracle.currentRewards[entityKey] || "0",
            oracleKey: oracle.oracleKey,
          }))
        : undefined;

      const hntRewards: client.Reward[] | undefined = hasHntRewards
        ? mergedHntBulkRewards.map((oracle) => ({
            currentRewards: oracle.currentRewards[entityKey] || "0",
            oracleKey: oracle.oracleKey,
          }))
        : undefined;

      assetsToClaim.push({
        asset: assetInfo.assetId,
        mobileRewards,
        hntRewards,
      });
    });

    // Build claim transactions in parallel
    const mobileClaimsToProcess = assetsToClaim.filter((c) => c.mobileRewards);
    const hntClaimsToProcess = assetsToClaim.filter((c) => c.hntRewards);

    if (mobileClaimsToProcess.length > 0) {
      console.log(
        `  Building MOBILE claim txns for ${mobileClaimsToProcess.length} assets...`
      );
    }
    if (hntClaimsToProcess.length > 0) {
      console.log(
        `  Building HNT claim txns for ${hntClaimsToProcess.length} assets...`
      );
    }

    const mobileClaimChunks = chunks(mobileClaimsToProcess, 100);
    const hntClaimChunks = chunks(hntClaimsToProcess, 100);

    const [mobileBatchTxns, hntBatchTxns] = await Promise.all([
      Promise.all(
        mobileClaimChunks.map((chunk) =>
          claimTxLimiter(async () => {
            try {
              const assets = chunk.map((c) => c.asset);
              return await formBulkTransactionsWithRetry(
                lazyProgram,
                rewardsOracleProgram,
                assets,
                mobileLazyDistributor,
                mobileLazyDistributorAcc,
                mergedMobileBulkRewards,
                authority.publicKey,
                problematicAssets,
                assetToKeyToAsset
              );
            } catch (err: any) {
              console.error(
                `Error forming mobile bulk transactions: ${err.message}`
              );
              return [];
            }
          })
        )
      ),
      Promise.all(
        hntClaimChunks.map((chunk) =>
          claimTxLimiter(async () => {
            try {
              const assets = chunk.map((c) => c.asset);
              return await formBulkTransactionsWithRetry(
                lazyProgram,
                rewardsOracleProgram,
                assets,
                hntLazyDistributor,
                hntLazyDistributorAcc,
                mergedHntBulkRewards,
                authority.publicKey,
                problematicAssets,
                assetToKeyToAsset
              );
            } catch (err: any) {
              console.error(
                `Error forming hnt bulk transactions: ${err.message}`
              );
              return [];
            }
          })
        )
      ),
    ]);

    const txns = [
      ...mobileBatchTxns.flat().filter(truthy),
      ...hntBatchTxns.flat().filter(truthy),
    ];
    console.log(`  Prepared ${txns.length} claim transactions`);

    if (!commit) {
      console.log(`  Dry run: would send ${txns.length} transactions`);
      break;
    }

    if (txns.length > 0) {
      console.log(`  Sending ${txns.length} transactions...`);
      txns.forEach((tx) => tx.sign([authority]));

      let lastLoggedProgress = 0;
      const logInterval = Math.max(10, Math.floor(txns.length / 20));
      await bulkSendRawTransactions(
        provider.connection,
        txns.map((tx) => Buffer.from(tx.serialize())),
        (status) => {
          if (
            status.totalProgress > lastLoggedProgress &&
            (status.totalProgress - lastLoggedProgress >= logInterval ||
              status.totalProgress === txns.length)
          ) {
            console.log(`    Sent ${status.totalProgress} / ${txns.length}`);
            lastLoggedProgress = status.totalProgress;
          }
        }
      );
      console.log(`    Sent ${txns.length} / ${txns.length}`);

      totalClaimedMobile = totalClaimedMobile.add(totalPendingMobile);
      totalClaimedHnt = totalClaimedHnt.add(totalPendingHnt);
      totalTransactions += txns.length;
    }

    // Wait before next iteration
    console.log("  Waiting 5 seconds...");
    await new Promise((resolve) => setTimeout(resolve, 5000));
  }

  return {
    claimedMobile: totalClaimedMobile,
    claimedHnt: totalClaimedHnt,
    transactions: totalTransactions,
    verifiedNoRewards,
  };
}

// Helper: Close key_to_asset accounts for a batch
async function closeKeyToAssets(
  assetsToClose: KeyToAssetInfo[],
  hemProgram: any,
  dao: PublicKey,
  mobileConfig: PublicKey,
  iotConfig: PublicKey,
  mobileSubDao: PublicKey,
  iotSubDao: PublicKey,
  authority: anchor.web3.Keypair,
  provider: anchor.AnchorProvider,
  commit: boolean
): Promise<number> {
  if (assetsToClose.length === 0) {
    return 0;
  }

  console.log(
    `  Preparing to close ${assetsToClose.length.toLocaleString()} accounts...`
  );

  const instructions: TransactionInstruction[] = [];

  // Separate hardcoded from subscribers
  const hardcodedAccountsToClose = assetsToClose.filter((k) => k.isHardcoded);
  const subscriberAccounts = assetsToClose.filter((k) => !k.isHardcoded);

  // Process hardcoded accounts (check info accounts)
  if (hardcodedAccountsToClose.length > 0) {
    console.log(
      `  Processing ${hardcodedAccountsToClose.length} hardcoded accounts...`
    );
    for (const { keyToAsset, assetId, entityKey } of hardcodedAccountsToClose) {
      const [mobileInfo] = mobileInfoKey(mobileConfig, entityKey);
      const [iotInfo] = iotInfoKey(iotConfig, entityKey);

      const ix = await hemProgram.methods
        .tempCloseKeyToAssetV0()
        .accountsPartial({
          keyToAsset,
          dao,
          authority: authority.publicKey,
          asset: assetId,
          mobileConfig,
          iotConfig,
          mobileInfo,
          iotInfo,
          iotSubDao,
          mobileSubDao,
        })
        .instruction();

      instructions.push(ix);
    }
  }

  // Process subscriber accounts in batches to avoid OOM
  if (subscriberAccounts.length > 0) {
    console.log(
      `  Processing ${subscriberAccounts.length.toLocaleString()} subscriber accounts...`
    );

    const INSTRUCTION_BATCH_SIZE = 500;
    const subscriberChunks = chunks(subscriberAccounts, INSTRUCTION_BATCH_SIZE);
    const ixLimiter = pLimit(10);

    for (let i = 0; i < subscriberChunks.length; i++) {
      const chunk = subscriberChunks[i];
      const chunkInstructions = await Promise.all(
        chunk.map(({ keyToAsset, assetId, entityKey }) =>
          ixLimiter(async () => {
            const [mobileInfo] = mobileInfoKey(mobileConfig, entityKey);
            const [iotInfo] = iotInfoKey(iotConfig, entityKey);

            return hemProgram.methods
              .tempCloseKeyToAssetV0()
              .accountsPartial({
                keyToAsset,
                dao,
                authority: authority.publicKey,
                asset: assetId,
                mobileConfig,
                iotConfig,
                mobileInfo,
                iotInfo,
                iotSubDao,
                mobileSubDao,
              })
              .instruction();
          })
        )
      );
      instructions.push(...chunkInstructions.filter(truthy));
    }
  }

  console.log(
    `  Batching ${instructions.length.toLocaleString()} instructions into transactions...`
  );

  const closeTxns = await batchInstructionsToTxsWithPriorityFee(
    provider,
    instructions,
    {
      useFirstEstimateForAll: true,
      computeUnitLimit: 600000,
    }
  );

  console.log(`  Prepared ${closeTxns.length} close transactions`);

  if (!commit) {
    console.log(
      `  Dry run: would send ${closeTxns.length} transactions to close ${assetsToClose.length} accounts`
    );
    return 0;
  }

  console.log(`  Sending ${closeTxns.length} transactions...`);

  let lastLoggedProgress = 0;
  const logInterval = Math.max(5, Math.floor(closeTxns.length / 20));
  await bulkSendTransactions(
    provider,
    closeTxns,
    (status) => {
      if (
        status.totalProgress > lastLoggedProgress &&
        (status.totalProgress - lastLoggedProgress >= logInterval ||
          status.totalProgress === closeTxns.length)
      ) {
        console.log(`    Sent ${status.totalProgress} / ${closeTxns.length}`);
        lastLoggedProgress = status.totalProgress;
      }
    },
    10,
    [authority]
  );
  console.log(`    Sent ${closeTxns.length} / ${closeTxns.length}`);

  return assetsToClose.length;
}

// Process a batch of assets: extract keys, check recipients, claim rewards, close accounts
async function processBatch(
  assets: any[],
  dao: PublicKey,
  hemProgram: any,
  lazyProgram: any,
  rewardsOracleProgram: any,
  mobileLazyDistributor: PublicKey,
  hntLazyDistributor: PublicKey,
  mobileConfig: PublicKey,
  iotConfig: PublicKey,
  mobileSubDao: PublicKey,
  iotSubDao: PublicKey,
  authority: anchor.web3.Keypair,
  provider: anchor.AnchorProvider,
  commit: boolean,
  problematicAssets: Map<string, ProblematicAsset>,
  totals: RunningTotals
): Promise<void> {
  console.log(
    `\n  Processing batch of ${assets.length.toLocaleString()} assets...`
  );

  // 1. Derive keyToAsset addresses and verify they exist on-chain
  const assetToKeyToAsset = new Map<
    string,
    { asset: any; keyToAsset: PublicKey }
  >();

  for (const asset of assets) {
    const keyToAssetAddr = keyToAssetForAsset(asset, dao);
    const keyToAssetPubkey =
      typeof keyToAssetAddr === "string"
        ? new PublicKey(keyToAssetAddr)
        : keyToAssetAddr;
    assetToKeyToAsset.set(keyToAssetPubkey.toBase58(), {
      asset,
      keyToAsset: keyToAssetPubkey,
    });
  }

  // Fetch all keyToAsset accounts to verify they exist (idempotent - skips already closed)
  const allKeyToAssetKeys = Array.from(assetToKeyToAsset.values()).map(
    (v) => v.keyToAsset
  );
  const keyToAssetInfos: KeyToAssetInfo[] = [];
  const fetchChunks = chunks(allKeyToAssetKeys, 100);
  const fetchLimiter = pLimit(10);

  console.log(
    `  Verifying ${allKeyToAssetKeys.length.toLocaleString()} keyToAsset accounts exist...`
  );

  await Promise.all(
    fetchChunks.map((chunk, chunkIndex) =>
      fetchLimiter(async () => {
        try {
          const accounts = await hemProgram.account.keyToAssetV0.fetchMultiple(
            chunk
          );
          accounts.forEach((account: any, index: number) => {
            if (account) {
              const keyToAssetKey = chunk[index];
              const info = assetToKeyToAsset.get(keyToAssetKey.toBase58());
              if (info) {
                keyToAssetInfos.push({
                  keyToAsset: keyToAssetKey,
                  assetId: info.asset.id,
                  entityKey: Buffer.from(account.entityKey),
                  isHardcoded: false,
                });
              }
            }
          });
        } catch (err: any) {
          console.error(
            `    Error fetching key_to_asset chunk: ${err.message}`
          );
        }
      })
    )
  );

  console.log(
    `  Found ${keyToAssetInfos.length.toLocaleString()} existing keyToAsset accounts`
  );

  if (keyToAssetInfos.length === 0) {
    console.log("  No valid key_to_asset accounts found in this batch");
    return;
  }

  // 2. Check recipients
  console.log("  Checking recipients...");

  const assetIdStrings = keyToAssetInfos.map((k) => k.assetId.toBase58());
  const mobileRecipientKeys = keyToAssetInfos.map(
    (k) => recipientKey(mobileLazyDistributor, k.assetId)[0]
  );
  const hntRecipientKeys = keyToAssetInfos.map(
    (k) => recipientKey(hntLazyDistributor, k.assetId)[0]
  );

  const existingRecipients = new Map<
    string,
    { mobile: boolean; hnt: boolean }
  >();
  const limiter = pLimit(10);

  // Fetch mobile and hnt recipients in parallel
  const mobileRecipientChunks = chunks(mobileRecipientKeys, 1000);
  const hntRecipientChunks = chunks(hntRecipientKeys, 1000);

  await Promise.all([
    // Mobile recipients
    Promise.all(
      mobileRecipientChunks.map((chunk, chunkIndex) =>
        limiter(async () => {
          const accountInfos = await fetchRecipientsWithRetry(
            lazyProgram,
            chunk
          );
          const chunkStartIndex = chunkIndex * 1000;
          accountInfos.forEach((info: any, index: number) => {
            if (info) {
              const assetKey = assetIdStrings[chunkStartIndex + index];
              const existing = existingRecipients.get(assetKey) || {
                mobile: false,
                hnt: false,
              };
              existing.mobile = true;
              existingRecipients.set(assetKey, existing);
            }
          });
        })
      )
    ),
    // HNT recipients
    Promise.all(
      hntRecipientChunks.map((chunk, chunkIndex) =>
        limiter(async () => {
          const accountInfos = await fetchRecipientsWithRetry(
            lazyProgram,
            chunk
          );
          const chunkStartIndex = chunkIndex * 1000;
          accountInfos.forEach((info: any, index: number) => {
            if (info) {
              const assetKey = assetIdStrings[chunkStartIndex + index];
              const existing = existingRecipients.get(assetKey) || {
                mobile: false,
                hnt: false,
              };
              existing.hnt = true;
              existingRecipients.set(assetKey, existing);
            }
          });
        })
      )
    ),
  ]);

  // Build assets with recipients
  const assetsWithRecipients: AssetWithRecipients[] = [];
  keyToAssetInfos.forEach((asset, index) => {
    const recipients = existingRecipients.get(assetIdStrings[index]);
    assetsWithRecipients.push({
      ...asset,
      hasMobileRecipient: recipients?.mobile || false,
      hasHntRecipient: recipients?.hnt || false,
    });
  });

  const withRecipients = assetsWithRecipients.filter(
    (a) => a.hasMobileRecipient || a.hasHntRecipient
  );
  console.log(`  Found ${withRecipients.length} assets with recipients`);

  // 3. Claim rewards
  let verifiedNoRewards = new Set<string>();
  if (withRecipients.length > 0) {
    console.log("  Claiming rewards...");
    const claimResult = await claimRewardsForBatch(
      withRecipients,
      lazyProgram,
      rewardsOracleProgram,
      mobileLazyDistributor,
      hntLazyDistributor,
      authority,
      provider,
      commit,
      problematicAssets
    );

    totals.claimedMobile = totals.claimedMobile.add(claimResult.claimedMobile);
    totals.claimedHnt = totals.claimedHnt.add(claimResult.claimedHnt);
    totals.claimedTransactions += claimResult.transactions;
    verifiedNoRewards = claimResult.verifiedNoRewards;
  }

  // 4. Close accounts - only close if:
  //    - Asset has no recipients (no rewards to claim), OR
  //    - Asset had recipients AND has been verified to have 0 remaining rewards
  //    - AND is not a problematic asset
  const assetsWithRecipientsSet = new Set(
    withRecipients.map((a) => a.assetId.toBase58())
  );
  const assetsToClose = keyToAssetInfos.filter((k) => {
    const assetStr = k.assetId.toBase58();
    // Never close problematic assets
    if (problematicAssets.has(assetStr)) return false;
    // If asset has no recipients, it's safe to close (no rewards)
    if (!assetsWithRecipientsSet.has(assetStr)) return true;
    // If asset had recipients, only close if verified to have no remaining rewards
    return verifiedNoRewards.has(assetStr);
  });

  if (assetsToClose.length > 0) {
    console.log("  Closing key_to_asset accounts...");
    const closedCount = await closeKeyToAssets(
      assetsToClose,
      hemProgram,
      dao,
      mobileConfig,
      iotConfig,
      mobileSubDao,
      iotSubDao,
      authority,
      provider,
      commit
    );

    totals.closedAccounts += closedCount;
  }

  totals.batchesProcessed++;
  console.log(
    `  Batch complete. Running totals: ${toMobile(
      totals.claimedMobile
    )} MOBILE, ${toHnt(
      totals.claimedHnt
    )} HNT, ${totals.closedAccounts.toLocaleString()} closed`
  );
}

export async function run(args: any = process.argv) {
  const yarg = yargs(args).options({
    wallet: {
      alias: "k",
      describe: "Anchor wallet keypair",
      default: `${os.homedir()}/.config/solana/id.json`,
    },
    url: {
      alias: "u",
      default: "http://127.0.0.1:8899",
      describe: "The solana url",
    },
    authority: {
      type: "string",
      describe: "Path to the authority keypair. Defaults to wallet.",
    },
    commit: {
      type: "boolean",
      describe: "Actually claim and close accounts. Otherwise dry-run",
      default: false,
    },
  });
  const argv = await yarg.argv;

  process.env.ANCHOR_WALLET = argv.wallet as string;
  process.env.ANCHOR_PROVIDER_URL = argv.url as string;
  anchor.setProvider(anchor.AnchorProvider.local(argv.url as string));
  const provider = anchor.getProvider() as anchor.AnchorProvider;

  const lazyProgram = await initLazy(provider);
  const hemProgram = await initHem(provider);
  const rewardsOracleProgram = await initRewards(provider);
  const memProgram = await initMem(provider);

  const authority = argv.authority
    ? loadKeypair(argv.authority as string)
    : loadKeypair(argv.wallet as string);

  const dao = daoKey(HNT_MINT)[0];
  const mobileSubDao = subDaoKey(MOBILE_MINT)[0];
  const iotSubDao = subDaoKey(IOT_MINT)[0];
  const mobileConfig = rewardableEntityConfigKey(mobileSubDao, "MOBILE")[0];
  const iotConfig = rewardableEntityConfigKey(iotSubDao, "IOT")[0];
  const mobileLazyDistributor = lazyDistributorKey(MOBILE_MINT)[0];
  const hntLazyDistributor = lazyDistributorKey(HNT_MINT)[0];

  // Track totals across all batches
  const totals: RunningTotals = {
    claimedMobile: new BN(0),
    claimedHnt: new BN(0),
    claimedTransactions: 0,
    closedAccounts: 0,
    batchesProcessed: 0,
  };

  // Track problematic assets that fail claiming
  const problematicAssets = new Map<string, ProblematicAsset>();

  console.log("=== INCREMENTAL BATCH PROCESSING ===\n");
  console.log(
    `DAS fetch size: ${DAS_BATCH_SIZE.toLocaleString()}, Process batch size: ${PROCESS_BATCH_SIZE.toLocaleString()}\n`
  );

  // ========== Process hardcoded accounts first ==========
  console.log("--- Processing hardcoded accounts ---\n");

  const hardcodedInfos: KeyToAssetInfo[] = [];
  for (const keyToAssetAddr of HARDCODED_KEY_TO_ASSETS) {
    try {
      const keyToAssetAcc = await hemProgram.account.keyToAssetV0.fetch(
        keyToAssetAddr
      );
      hardcodedInfos.push({
        keyToAsset: keyToAssetAddr,
        assetId: keyToAssetAcc.asset,
        entityKey: Buffer.from(keyToAssetAcc.entityKey),
        isHardcoded: true,
      });
    } catch {
      // Already closed
    }
  }

  if (hardcodedInfos.length > 0) {
    console.log(`Found ${hardcodedInfos.length} hardcoded accounts to process`);

    // Check recipients for hardcoded
    const hardcodedMobileRecipients = hardcodedInfos.map(
      (k) => recipientKey(mobileLazyDistributor, k.assetId)[0]
    );
    const hardcodedHntRecipients = hardcodedInfos.map(
      (k) => recipientKey(hntLazyDistributor, k.assetId)[0]
    );

    const [mobileAccounts, hntAccounts] = await Promise.all([
      lazyProgram.account.recipientV0.fetchMultiple(hardcodedMobileRecipients),
      lazyProgram.account.recipientV0.fetchMultiple(hardcodedHntRecipients),
    ]);

    const hardcodedWithRecipients: AssetWithRecipients[] = hardcodedInfos.map(
      (info, index) => ({
        ...info,
        hasMobileRecipient: !!mobileAccounts[index],
        hasHntRecipient: !!hntAccounts[index],
      })
    );

    const withRecipients = hardcodedWithRecipients.filter(
      (a) => a.hasMobileRecipient || a.hasHntRecipient
    );

    let hardcodedVerifiedNoRewards = new Set<string>();
    if (withRecipients.length > 0) {
      console.log(
        `Claiming rewards for ${withRecipients.length} hardcoded accounts...`
      );
      const claimResult = await claimRewardsForBatch(
        withRecipients,
        lazyProgram,
        rewardsOracleProgram,
        mobileLazyDistributor,
        hntLazyDistributor,
        authority,
        provider,
        argv.commit as boolean,
        problematicAssets
      );
      totals.claimedMobile = totals.claimedMobile.add(
        claimResult.claimedMobile
      );
      totals.claimedHnt = totals.claimedHnt.add(claimResult.claimedHnt);
      totals.claimedTransactions += claimResult.transactions;
      hardcodedVerifiedNoRewards = claimResult.verifiedNoRewards;
    }

    // Close hardcoded accounts - only those verified to have no remaining rewards
    const hardcodedWithRecipientsSet = new Set(
      withRecipients.map((a) => a.assetId.toBase58())
    );
    const hardcodedToClose = hardcodedInfos.filter((k) => {
      const assetStr = k.assetId.toBase58();
      if (problematicAssets.has(assetStr)) return false;
      if (!hardcodedWithRecipientsSet.has(assetStr)) return true;
      return hardcodedVerifiedNoRewards.has(assetStr);
    });
    if (hardcodedToClose.length > 0) {
      console.log(`Closing ${hardcodedToClose.length} hardcoded accounts...`);
      const closedCount = await closeKeyToAssets(
        hardcodedToClose,
        hemProgram,
        dao,
        mobileConfig,
        iotConfig,
        mobileSubDao,
        iotSubDao,
        authority,
        provider,
        argv.commit as boolean
      );
      totals.closedAccounts += closedCount;
    }
  } else {
    console.log("All hardcoded accounts already closed");
  }

  // ========== Process subscriber collections incrementally ==========
  console.log("\n--- Processing subscriber collections ---\n");

  // Fetch all CarrierV0 accounts to get subscriber collections
  console.log("Fetching CarrierV0 accounts...");
  const carriers = await memProgram.account.carrierV0.all();
  const subscriberCollections = new Set<string>();
  for (const carrier of carriers) {
    subscriberCollections.add(carrier.account.collection.toBase58());
  }
  console.log(
    `Found ${subscriberCollections.size} subscriber collection(s) from ${carriers.length} carriers\n`
  );

  if (subscriberCollections.size === 0) {
    console.log("No subscriber collections found");
  }

  // Process each collection incrementally
  let collectionIndex = 0;
  for (const collection of subscriberCollections) {
    collectionIndex++;
    console.log(
      `\n=== Collection ${collectionIndex}/${subscriberCollections.size}: ${collection} ===\n`
    );

    let cursor: string | undefined = undefined;
    let accumulatedAssets: any[] = [];

    while (true) {
      const result = await getAssetsWithRetry(provider.connection.rpcEndpoint, {
        groupValue: collection,
        limit: DAS_BATCH_SIZE,
        cursor,
      });

      accumulatedAssets.push(...result.items);

      const hasMore = !!result.cursor;
      const shouldProcess =
        accumulatedAssets.length >= PROCESS_BATCH_SIZE || !hasMore;

      if (shouldProcess && accumulatedAssets.length > 0) {
        console.log(
          `\n--- Processing ${accumulatedAssets.length.toLocaleString()} assets ---`
        );
        await processBatch(
          accumulatedAssets,
          dao,
          hemProgram,
          lazyProgram,
          rewardsOracleProgram,
          mobileLazyDistributor,
          hntLazyDistributor,
          mobileConfig,
          iotConfig,
          mobileSubDao,
          iotSubDao,
          authority,
          provider,
          argv.commit as boolean,
          problematicAssets,
          totals
        );
        accumulatedAssets = [];
      }

      if (!hasMore) {
        break;
      }

      cursor = result.cursor;
    }
  }

  // ========== Summary ==========
  console.log("\n=== SUMMARY ===\n");
  console.log(`Batches processed: ${totals.batchesProcessed}`);
  console.log(
    `Total claimed: ${toMobile(totals.claimedMobile)} MOBILE, ${toHnt(
      totals.claimedHnt
    )} HNT`
  );
  console.log(`Claim transactions: ${totals.claimedTransactions}`);
  console.log(`Accounts closed: ${totals.closedAccounts.toLocaleString()}`);

  if (problematicAssets.size > 0) {
    console.log(`\n⚠️  Skipped ${problematicAssets.size} problematic assets:`);
    for (const [, { asset, keyToAsset }] of problematicAssets) {
      console.log(
        `  { asset: ${asset.toBase58()}, keyToAsset: ${keyToAsset.toBase58()} }`
      );
    }
  }

  if (!argv.commit) {
    console.log("\nDry run complete. Re-run with --commit to execute 🚀");
  } else {
    console.log("\n✓ Complete!");
  }

  console.log(
    "Next: run close-all-subscriber-recipients to close RecipientV0 accounts"
  );
}
