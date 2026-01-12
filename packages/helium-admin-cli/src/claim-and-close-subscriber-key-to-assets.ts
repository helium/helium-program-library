import * as anchor from "@coral-xyz/anchor";
import * as client from "@helium/distributor-oracle";
import {
  init as initHem,
  rewardableEntityConfigKey,
  iotInfoKey,
  mobileInfoKey,
  decodeEntityKey,
  keyToAssetKey,
} from "@helium/helium-entity-manager-sdk";
import { daoKey, subDaoKey } from "@helium/helium-sub-daos-sdk";
import {
  init as initLazy,
  lazyDistributorKey,
} from "@helium/lazy-distributor-sdk";
import { init as initRewards } from "@helium/rewards-oracle-sdk";
import {
  HNT_MINT,
  MOBILE_MINT,
  IOT_MINT,
  batchInstructionsToTxsWithPriorityFee,
  bulkSendRawTransactions,
  toVersionedTx,
  populateMissingDraftInfo,
  chunks,
  truthy,
  humanReadable,
} from "@helium/spl-utils";
import { Connection, PublicKey, TransactionInstruction } from "@solana/web3.js";
import BN from "bn.js";
import bs58 from "bs58";
import fs from "fs";
import os from "os";
import pLimit from "p-limit";
import yargs from "yargs/yargs";
import { loadKeypair } from "./utils";

// Token decimals
const MOBILE_DECIMALS = 6;
const HNT_DECIMALS = 8;
// Batch size for processing assets
const PROCESS_BATCH_SIZE = 10000;
// Number of batches to process in parallel
const PARALLEL_BATCHES = 4;

interface JsonEntry {
  address: string;
  asset: string;
  hntRecipientKey: string;
  mobileRecipientKey: string;
  hntSignatureCount: number;
  mobileSignatureCount: number;
  encodedEntityKey: string;
}

// Helper to format token amounts
const toMobile = (amount: BN) => humanReadable(amount, MOBILE_DECIMALS);
const toHnt = (amount: BN) => humanReadable(amount, HNT_DECIMALS);

// Hardcoded key_to_asset addresses from initial migration that need special handling
// These can be closed even if they have iot_info or mobile_info accounts
const HARDCODED_KEY_TO_ASSETS = [
  new PublicKey("AcKpRTmy6YKpQaWfLDBUaduQU1kHhNVLrPkW3TmEEqsc"),
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
        // Silently split - only log when we find the actual problematic asset
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

      // For transient errors, retry with backoff (silently)
      if (attempt < maxRetries - 1) {
        const delay = Math.min(2000 * Math.pow(2, attempt), 30000);
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
  assets: KeyToAssetInfo[],
  lazyProgram: any,
  rewardsOracleProgram: any,
  mobileLazyDistributor: PublicKey,
  hntLazyDistributor: PublicKey,
  authority: anchor.web3.Keypair,
  provider: anchor.AnchorProvider,
  commit: boolean,
  problematicAssets: Map<string, ProblematicAsset>,
  logPrefix: string = ""
): Promise<{
  claimedMobile: BN;
  claimedHnt: BN;
  transactions: number;
  verifiedNoRewards: Set<string>;
}> {
  const log = (msg: string) => console.log(`${logPrefix}${msg}`);
  const logErr = (msg: string) => console.error(`${logPrefix}${msg}`);

  let totalClaimedMobile = new BN(0);
  let totalClaimedHnt = new BN(0);
  let totalTransactions = 0;
  // Track assets that have been verified to have 0 remaining rewards
  const verifiedNoRewards = new Set<string>();

  if (assets.length === 0) {
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
    }
  >();

  // Also build asset -> keyToAsset map for tracking problematic assets
  const assetToKeyToAsset = new Map<string, PublicKey>();

  let decodeFailures = 0;
  assets.forEach(({ assetId, keyToAsset, entityKey }) => {
    const entityKeyStr = decodeEntityKey(entityKey, { b58: {} });
    if (entityKeyStr) {
      entityKeyToAsset.set(entityKeyStr, {
        assetId,
        keyToAsset,
        entityKey,
      });
      assetToKeyToAsset.set(assetId.toBase58(), keyToAsset);
    } else {
      decodeFailures++;
    }
  });

  if (decodeFailures > 0) {
    logErr(`⚠️ Failed to decode ${decodeFailures} entity keys`);
  }

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
    // Only log iteration on retries
    if (claimIteration > 1) {
      log(`Claim retry ${claimIteration}/${MAX_CLAIM_ITERATIONS}...`);
    }

    // Get pending rewards using getPendingRewards (handles median + totalClaimed internally)
    let mobilePendingRewards: Record<string, string> = {};
    let hntPendingRewards: Record<string, string> = {};
    let rewardsFetchSucceeded = false;

    log(`  Fetching pending rewards (${entityKeys.length} keys)...`);

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
                logErr(`Error fetching mobile pending rewards: ${err.message}`);
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
                logErr(`Error fetching hnt pending rewards: ${err.message}`);
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
      logErr(`Error fetching pending rewards: ${err.message}`);
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

    const assetsWithZero = entityKeys.length - assetsWithRewards;
    log(
      `  Checked ${entityKeys.length}: ${assetsWithRewards} with rewards, ${assetsWithZero} with zero`
    );
    log(
      `    Claims needed: ${assetsToClaimMobile.length} MOBILE + ${
        assetsToClaimHnt.length
      } HNT = ${assetsToClaimMobile.length + assetsToClaimHnt.length} total`
    );

    if (assetsWithRewards === 0) {
      if (!rewardsFetchSucceeded) {
        logErr("⚠️ Failed to fetch rewards from oracles");
        break;
      }

      // All assets in this batch now have 0 rewards - mark them as verified
      assets.forEach((asset) => {
        if (!problematicAssets.has(asset.assetId.toBase58())) {
          verifiedNoRewards.add(asset.assetId.toBase58());
        }
      });
      log(`Rewards: verified ${verifiedNoRewards.size} with 0 pending`);
      break;
    }

    // Now fetch bulk rewards only for assets with pending > 0
    const mobileEntityKeysWithRewards = assetsToClaimMobile;
    const hntEntityKeysWithRewards = assetsToClaimHnt;

    let mergedMobileBulkRewards: client.BulkRewards[] = [];
    let mergedHntBulkRewards: client.BulkRewards[] = [];

    if (mobileEntityKeysWithRewards.length > 0) {
      log(
        `  Fetching bulk rewards for ${mobileEntityKeysWithRewards.length} MOBILE assets...`
      );
      const mobileChunks = chunks(mobileEntityKeysWithRewards, 2500);
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
      log(
        `  Fetching bulk rewards for ${hntEntityKeysWithRewards.length} HNT assets...`
      );
      const hntChunks = chunks(hntEntityKeysWithRewards, 2500);
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

    // Build and send in small batches to keep blockhashes fresh
    // formBulkTransactions creates txns with blockhash - must send before they expire (~60s)
    const mobileClaimsToProcess = assetsToClaim.filter((c) => c.mobileRewards);
    const hntClaimsToProcess = assetsToClaim.filter((c) => c.hntRewards);

    const totalClaims =
      mobileClaimsToProcess.length + hntClaimsToProcess.length;
    log(
      `  Claims to process: ${mobileClaimsToProcess.length} MOBILE + ${hntClaimsToProcess.length} HNT = ${totalClaims} total`
    );

    if (!commit) {
      log(
        `Rewards: ${assetsWithRewards} with pending, ${assetsWithZero} with zero (${totalClaims} claim txns) [dry run]`
      );
      log(
        `  With --commit: would claim ${assetsWithRewards}, then close all ${entityKeys.length} after verification`
      );
      break;
    }

    const sendConnection = new Connection(
      provider.connection.rpcEndpoint,
      "confirmed"
    );

    let totalConfirmed = 0;
    let totalTxns = 0;
    const CLAIMS_PER_BATCH = 300;
    const PARALLEL_CLAIM_BATCHES = 5; // Process 5 batches in parallel
    const batchLimiter = pLimit(PARALLEL_CLAIM_BATCHES);

    // Helper to process a single batch (build, sign, send)
    const processBatch = async (
      claims: typeof assetsToClaim,
      lazyDist: PublicKey,
      lazyDistAcc: any,
      bulkRewards: client.BulkRewards[],
      label: string
    ): Promise<{ confirmed: number; total: number }> => {
      const claimChunks = chunks(claims, 100);

      const batchTxns = await Promise.all(
        claimChunks.map((chunk) =>
          claimTxLimiter(async () => {
            try {
              return await formBulkTransactionsWithRetry(
                lazyProgram,
                rewardsOracleProgram,
                chunk.map((c) => c.asset),
                lazyDist,
                lazyDistAcc,
                bulkRewards,
                authority.publicKey,
                problematicAssets,
                assetToKeyToAsset
              );
            } catch (err: any) {
              logErr(`    ${label} error: ${err.message}`);
              return [];
            }
          })
        )
      );

      const txns = batchTxns.flat().filter(truthy);
      if (txns.length === 0) return { confirmed: 0, total: 0 };

      txns.forEach((tx) => tx.sign([authority]));

      try {
        const confirmed = await bulkSendRawTransactions(
          sendConnection,
          txns.map((tx) => Buffer.from(tx.serialize()))
        );
        log(`    ${label}: ${confirmed.length}/${txns.length} confirmed`);
        return { confirmed: confirmed.length, total: txns.length };
      } catch (err: any) {
        logErr(`    ${label} send error: ${err.message}`);
        return { confirmed: 0, total: txns.length };
      }
    };

    // Create all batch tasks
    const mobileBatches = chunks(mobileClaimsToProcess, CLAIMS_PER_BATCH);
    const hntBatches = chunks(hntClaimsToProcess, CLAIMS_PER_BATCH);

    log(
      `  Processing ${mobileBatches.length} MOBILE + ${hntBatches.length} HNT batches (${PARALLEL_CLAIM_BATCHES} parallel)...`
    );

    const allBatchTasks = [
      ...mobileBatches.map((batch, idx) =>
        batchLimiter(() =>
          processBatch(
            batch,
            mobileLazyDistributor,
            mobileLazyDistributorAcc,
            mergedMobileBulkRewards,
            `MOBILE ${idx + 1}/${mobileBatches.length}`
          )
        )
      ),
      ...hntBatches.map((batch, idx) =>
        batchLimiter(() =>
          processBatch(
            batch,
            hntLazyDistributor,
            hntLazyDistributorAcc,
            mergedHntBulkRewards,
            `HNT ${idx + 1}/${hntBatches.length}`
          )
        )
      ),
    ];

    const results = await Promise.all(allBatchTasks);

    for (const result of results) {
      totalConfirmed += result.confirmed;
      totalTxns += result.total;
    }

    // Track what was claimed
    if (totalConfirmed > 0 && totalTxns > 0) {
      totalClaimedMobile = totalClaimedMobile.add(
        totalPendingMobile.mul(new BN(totalConfirmed)).div(new BN(totalTxns))
      );
      totalClaimedHnt = totalClaimedHnt.add(
        totalPendingHnt.mul(new BN(totalConfirmed)).div(new BN(totalTxns))
      );
      totalTransactions += totalConfirmed;
    }

    if (totalConfirmed === totalTxns && totalTxns > 0) {
      log(
        `Rewards: claimed ${toMobile(totalPendingMobile)} MOBILE, ${toHnt(
          totalPendingHnt
        )} HNT (${totalConfirmed} txns)`
      );
    } else if (totalTxns > 0) {
      log(
        `Rewards: ${totalConfirmed}/${totalTxns} txns confirmed (retrying...)`
      );
    }

    // Wait before next iteration
    await new Promise((resolve) => setTimeout(resolve, 5000));
  }

  return {
    claimedMobile: totalClaimedMobile,
    claimedHnt: totalClaimedHnt,
    transactions: totalTransactions,
    verifiedNoRewards,
  };
}

// Helper: Close key_to_asset accounts for a batch (with retry loop)
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
  commit: boolean,
  logPrefix: string = ""
): Promise<number> {
  const log = (msg: string) => console.log(`${logPrefix}${msg}`);
  const logErr = (msg: string) => console.error(`${logPrefix}${msg}`);

  if (assetsToClose.length === 0) {
    return 0;
  }

  const originalCount = assetsToClose.length;

  if (!commit) {
    log(`Closes: ${originalCount.toLocaleString()} accounts [dry run]`);
    return 0;
  }

  // Use fresh connection to avoid account-fetch-cache signature subscriptions
  const sendConnection = new Connection(
    provider.connection.rpcEndpoint,
    "confirmed"
  );

  const MAX_CLOSE_ITERATIONS = 10;
  let closeIteration = 0;
  let totalClosed = 0;
  let remainingAssets = [...assetsToClose];

  // Build a map for O(1) lookups
  const assetsByKey = new Map(
    assetsToClose.map((a) => [a.keyToAsset.toBase58(), a])
  );

  while (closeIteration < MAX_CLOSE_ITERATIONS && remainingAssets.length > 0) {
    closeIteration++;
    // Only log iteration on retries
    if (closeIteration > 1) {
      log(`Close retry ${closeIteration}/${MAX_CLOSE_ITERATIONS}...`);

      // On retry, check which accounts still exist (parallel)
      const keyToAssetKeys = remainingAssets.map((a) => a.keyToAsset);
      const fetchChunks = chunks(keyToAssetKeys, 100);
      const stillExisting: KeyToAssetInfo[] = [];
      const fetchLimiter = pLimit(10);

      await Promise.all(
        fetchChunks.map((chunk) =>
          fetchLimiter(async () => {
            try {
              const accounts =
                await hemProgram.account.keyToAssetV0.fetchMultiple(chunk);
              accounts.forEach((account: any, index: number) => {
                if (account) {
                  const asset = assetsByKey.get(chunk[index].toBase58());
                  if (asset) {
                    stillExisting.push(asset);
                  }
                }
              });
            } catch (err: any) {
              // On error, assume all in chunk still exist
              chunk.forEach((key) => {
                const asset = assetsByKey.get(key.toBase58());
                if (asset) {
                  stillExisting.push(asset);
                }
              });
            }
          })
        )
      );

      const closedThisCheck = remainingAssets.length - stillExisting.length;
      if (closedThisCheck > 0) {
        totalClosed += closedThisCheck;
      }

      remainingAssets = stillExisting;

      if (remainingAssets.length === 0) {
        log(`Closed: ${totalClosed.toLocaleString()} accounts`);
        break;
      }
    }

    // Build instructions for remaining accounts
    const instructions: TransactionInstruction[] = [];
    const hardcodedAccountsToClose = remainingAssets.filter(
      (k) => k.isHardcoded
    );
    const subscriberAccounts = remainingAssets.filter((k) => !k.isHardcoded);

    // Process hardcoded accounts
    if (hardcodedAccountsToClose.length > 0) {
      for (const {
        keyToAsset,
        assetId,
        entityKey,
      } of hardcodedAccountsToClose) {
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

    // Process subscriber accounts in parallel batches
    if (subscriberAccounts.length > 0) {
      const ixLimiter = pLimit(50); // Increased parallelism

      const allInstructions = await Promise.all(
        subscriberAccounts.map(({ keyToAsset, assetId, entityKey }) =>
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
      instructions.push(...allInstructions.filter(truthy));
    }

    // Batch into transactions
    const closeTxns = await batchInstructionsToTxsWithPriorityFee(
      provider,
      instructions,
      {
        useFirstEstimateForAll: true,
        computeUnitLimit: 600000,
      }
    );

    // Get fresh blockhash for this iteration
    const recentBlockhash = await sendConnection.getLatestBlockhash(
      "confirmed"
    );

    const signedTxns = await Promise.all(
      closeTxns.map(async (draft) => {
        await populateMissingDraftInfo(provider.connection, draft);
        const tx = toVersionedTx({
          ...draft,
          recentBlockhash: recentBlockhash.blockhash,
        });
        tx.sign([authority]);
        return tx;
      })
    );

    try {
      await bulkSendRawTransactions(
        sendConnection,
        signedTxns.map((tx) => Buffer.from(tx.serialize())),
        undefined,
        recentBlockhash.lastValidBlockHeight
      );
    } catch (err: any) {
      logErr(`Error closing accounts: ${err.message}`);
    }

    // Wait before next iteration
    if (closeIteration < MAX_CLOSE_ITERATIONS) {
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }

  // Final summary
  if (totalClosed > 0 && remainingAssets.length === 0) {
    // Already logged above
  } else if (totalClosed > 0) {
    log(
      `Closed: ${totalClosed.toLocaleString()}/${originalCount.toLocaleString()} accounts`
    );
  }

  if (remainingAssets.length > 0) {
    log(`⚠️ ${remainingAssets.length} accounts failed to close`);
  }

  return totalClosed;
}

// Process a batch of KeyToAssetInfo entries: claim rewards, close accounts
async function processBatch(
  keyToAssetInfos: KeyToAssetInfo[],
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
  totals: RunningTotals,
  logPrefix: string = ""
): Promise<void> {
  const log = (msg: string) => console.log(`${logPrefix}${msg}`);

  if (keyToAssetInfos.length === 0) {
    log("No entries to process");
    return;
  }

  // Summary log for this batch
  log(`Processing ${keyToAssetInfos.length.toLocaleString()} entries`);

  // Claim rewards for ALL entries (formBulkTransactions will init recipients as needed)
  let verifiedNoRewards = new Set<string>();
  const claimResult = await claimRewardsForBatch(
    keyToAssetInfos,
    lazyProgram,
    rewardsOracleProgram,
    mobileLazyDistributor,
    hntLazyDistributor,
    authority,
    provider,
    commit,
    problematicAssets,
    logPrefix
  );

  totals.claimedMobile = totals.claimedMobile.add(claimResult.claimedMobile);
  totals.claimedHnt = totals.claimedHnt.add(claimResult.claimedHnt);
  totals.claimedTransactions += claimResult.transactions;
  verifiedNoRewards = claimResult.verifiedNoRewards;

  // Close accounts - only close if verified to have 0 remaining rewards
  const assetsToClose = keyToAssetInfos.filter((k) => {
    const assetStr = k.assetId.toBase58();
    if (problematicAssets.has(assetStr)) return false;
    return verifiedNoRewards.has(assetStr);
  });

  log(
    `Verified: ${verifiedNoRewards.size}, Problematic: ${problematicAssets.size}, To close: ${assetsToClose.length}`
  );

  if (assetsToClose.length > 0) {
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
      commit,
      logPrefix
    );

    totals.closedAccounts += closedCount;
  }

  totals.batchesProcessed++;
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
    inputFile: {
      alias: "i",
      type: "string",
      required: true,
      describe: "Path to JSON file with subscriber entries",
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

  // Read input file
  const inputPath = argv.inputFile as string;
  console.log(`Reading input file: ${inputPath}\n`);
  const rawData = fs.readFileSync(inputPath, "utf-8");
  const entries: JsonEntry[] = JSON.parse(rawData);
  console.log(
    `Loaded ${entries.length.toLocaleString()} entries from JSON file\n`
  );

  console.log("=== BATCH PROCESSING ===\n");
  console.log(`Process batch size: ${PROCESS_BATCH_SIZE.toLocaleString()}\n`);

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

    let hardcodedVerifiedNoRewards = new Set<string>();
    console.log(
      `Claiming rewards for ${hardcodedInfos.length} hardcoded accounts...`
    );
    const claimResult = await claimRewardsForBatch(
      hardcodedInfos,
      lazyProgram,
      rewardsOracleProgram,
      mobileLazyDistributor,
      hntLazyDistributor,
      authority,
      provider,
      argv.commit as boolean,
      problematicAssets
    );
    totals.claimedMobile = totals.claimedMobile.add(claimResult.claimedMobile);
    totals.claimedHnt = totals.claimedHnt.add(claimResult.claimedHnt);
    totals.claimedTransactions += claimResult.transactions;
    hardcodedVerifiedNoRewards = claimResult.verifiedNoRewards;

    const hardcodedToClose = hardcodedInfos.filter((k) => {
      const assetStr = k.assetId.toBase58();
      if (problematicAssets.has(assetStr)) return false;
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

  // ========== Process subscriber entries from input file ==========
  console.log("\n--- Processing subscriber entries from input file ---\n");

  // Convert entries to KeyToAssetInfo, filtering to only those that exist on-chain
  console.log("Verifying KeyToAsset accounts exist on-chain...");

  const allKeyToAssetInfos: KeyToAssetInfo[] = [];
  const entryChunks = chunks(entries, 100);
  const fetchLimiter = pLimit(10);
  let verifiedCount = 0;

  await Promise.all(
    entryChunks.map((chunk) =>
      fetchLimiter(async () => {
        const keyToAssetKeys = chunk.map((e) => new PublicKey(e.address));
        try {
          const accounts = await hemProgram.account.keyToAssetV0.fetchMultiple(
            keyToAssetKeys
          );
          accounts.forEach((account: any, index: number) => {
            if (account) {
              const entry = chunk[index];
              allKeyToAssetInfos.push({
                keyToAsset: new PublicKey(entry.address),
                assetId: new PublicKey(entry.asset),
                entityKey: Buffer.from(bs58.decode(entry.encodedEntityKey)),
                isHardcoded: HARDCODED_KEY_TO_ASSETS.some((h) =>
                  h.equals(new PublicKey(entry.address))
                ),
              });
            }
          });
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : String(err);
          console.error(`Error fetching keyToAsset chunk: ${message}`);
        }
        verifiedCount += chunk.length;
        if (verifiedCount % 1000 === 0 || verifiedCount >= entries.length) {
          process.stdout.write(
            `\r  Verified ${verifiedCount.toLocaleString()} / ${entries.length.toLocaleString()} entries`
          );
        }
      })
    )
  );
  console.log(); // newline

  console.log(
    `\nFound ${allKeyToAssetInfos.length.toLocaleString()} open KeyToAsset accounts\n`
  );

  if (allKeyToAssetInfos.length === 0) {
    console.log("No open KeyToAsset accounts to process");
  } else {
    // Split into batches
    const batches = chunks(allKeyToAssetInfos, PROCESS_BATCH_SIZE);
    console.log(
      `Processing ${
        batches.length
      } batches of up to ${PROCESS_BATCH_SIZE.toLocaleString()} entries (${PARALLEL_BATCHES} parallel)\n`
    );

    // Process batches in parallel
    const batchLimiter = pLimit(PARALLEL_BATCHES);
    let completedBatches = 0;

    await Promise.all(
      batches.map((batch, batchIndex) =>
        batchLimiter(async () => {
          const batchNum = batchIndex + 1;
          const prefix = `[Batch ${batchNum}/${batches.length}] `;
          console.log(
            `\n${prefix}Starting (${batch.length.toLocaleString()} entries)`
          );
          await processBatch(
            batch,
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
            totals,
            prefix
          );
          completedBatches++;
          console.log(
            `${prefix}✓ Complete (${completedBatches}/${batches.length} total done)`
          );
        })
      )
    );
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
    console.log("\nDry run complete. Re-run with --commit to execute");
  } else {
    console.log("\n✓ Complete!");
  }

  console.log(
    "Next: run close-all-subscriber-recipients to close RecipientV0 accounts"
  );
}
