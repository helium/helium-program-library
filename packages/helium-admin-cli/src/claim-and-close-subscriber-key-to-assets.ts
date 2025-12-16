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
import bs58 from "bs58";
import os from "os";
import pLimit from "p-limit";
import yargs from "yargs/yargs";
import { loadKeypair } from "./utils";

// Token decimals
const MOBILE_DECIMALS = 6;
const HNT_DECIMALS = 8;

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

  // ========== STEP 1: Find all subscriber assets AND hardcoded key_to_assets ==========
  console.log("=== STEP 1: FINDING KEY_TO_ASSET ACCOUNTS ===\n");

  // Build list of key_to_asset info
  const keyToAssetInfos: {
    keyToAsset: PublicKey;
    assetId: PublicKey;
    asset?: any; // DAS asset for URI extraction
    entityKey?: Buffer; // Only for hardcoded accounts (already fetched)
    isHardcoded: boolean;
  }[] = [];

  // Process hardcoded key_to_assets FIRST
  // Note: We fetch these to get assetId and asset data (for entityKey)
  console.log(
    `Checking ${HARDCODED_KEY_TO_ASSETS.length} hardcoded accounts...`
  );

  const hardcodedAccounts = await Promise.all(
    HARDCODED_KEY_TO_ASSETS.map(async (keyToAssetAddr) => {
      try {
        const keyToAssetAcc = await hemProgram.account.keyToAssetV0.fetch(
          keyToAssetAddr
        );
        return {
          keyToAsset: keyToAssetAddr,
          assetId: keyToAssetAcc.asset,
          entityKey: Buffer.from(keyToAssetAcc.entityKey),
          isHardcoded: true,
        };
      } catch (err: any) {
        return null; // Already closed
      }
    })
  );

  keyToAssetInfos.push(
    ...hardcodedAccounts.filter((a): a is NonNullable<typeof a> => a !== null)
  );

  if (keyToAssetInfos.length > 0) {
    console.log(`  Found ${keyToAssetInfos.length} hardcoded key_to_assets\n`);
  } else {
    console.log(`  All hardcoded accounts already closed\n`);
  }

  // Find all subscriber assets using DAS
  // Strategy: Fetch all MakerV0 accounts, identify subscriber collections, search by those
  console.log("Finding all subscriber assets via DAS...");
  const allSubscriberAssets: Map<string, any> = new Map(); // Dedupe by asset ID

  try {
    // Fetch all CarrierV0 accounts to get subscriber collections
    console.log("Fetching CarrierV0 accounts...");
    const carriers = await memProgram.account.carrierV0.all();
    const subscriberCollections = new Set<string>();
    for (const carrier of carriers) {
      subscriberCollections.add(carrier.account.collection.toBase58());
    }
    console.log(
      `  Found ${subscriberCollections.size} subscriber collection(s) from ${carriers.length} carriers`
    );

    if (subscriberCollections.size === 0) {
      console.log("  No subscriber collections found");
    }

    // Search each subscriber collection using cursor-based pagination
    console.log("Searching DAS for subscriber assets...");

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

          // Exponential backoff: 2s, 4s, 8s, 16s, 30s
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

    for (const collection of subscriberCollections) {
      const limit = 1000;
      const startSize = allSubscriberAssets.size;
      let cursor: string | undefined = undefined;
      let fetchCount = 0;
      const startTime = Date.now();

      console.log(`  Collection ${collection}: Starting...`);

      while (true) {
        const result = await getAssetsWithRetry(
          provider.connection.rpcEndpoint,
          {
            groupValue: collection,
            limit,
            cursor,
          }
        );

        for (const asset of result.items) {
          allSubscriberAssets.set(asset.id.toBase58(), asset);
        }

        fetchCount++;
        const collectionTotal = allSubscriberAssets.size - startSize;

        // Show progress: first 3 fetches, then every 25 fetches
        if (fetchCount <= 3 || fetchCount % 25 === 0) {
          console.log(
            `    ${fetchCount} fetches: ${collectionTotal.toLocaleString()} assets`
          );
        }

        // Stop if no cursor returned (indicates end of data)
        if (!result.cursor) {
          break;
        }

        cursor = result.cursor;
      }

      const thisCollectionTotal = allSubscriberAssets.size - startSize;
      const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
      console.log(
        `  Complete: ${thisCollectionTotal.toLocaleString()} assets in ${fetchCount} fetches (${totalTime}s, cumulative: ${allSubscriberAssets.size.toLocaleString()})`
      );
    }

    console.log(
      `\nTotal unique subscriber assets found: ${allSubscriberAssets.size}`
    );

    console.log("Processing assets into key_to_asset accounts...");

    const existingKeyToAssetSet = new Set(
      keyToAssetInfos.map((k) => k.keyToAsset.toBase58())
    );

    let processed = 0;
    for (const asset of allSubscriberAssets.values()) {
      const keyToAssetAddr = keyToAssetForAsset(asset, dao);
      // Ensure keyToAssetAddr is a PublicKey
      const keyToAssetPubkey =
        typeof keyToAssetAddr === "string"
          ? new PublicKey(keyToAssetAddr)
          : keyToAssetAddr;

      // Skip if already in list (from hardcoded)
      const keyToAssetStr = keyToAssetPubkey.toBase58();
      if (!existingKeyToAssetSet.has(keyToAssetStr)) {
        keyToAssetInfos.push({
          keyToAsset: keyToAssetPubkey,
          assetId: asset.id,
          asset: asset, // Store for URI extraction
          isHardcoded: false,
        });
        existingKeyToAssetSet.add(keyToAssetStr);
      }

      processed++;
      // Show progress every 100k assets
      if (processed % 100000 === 0) {
        console.log(
          `  Processed ${processed.toLocaleString()} / ${allSubscriberAssets.size.toLocaleString()} assets...`
        );
      }
    }

    console.log(
      `  Processed all ${allSubscriberAssets.size.toLocaleString()} assets\n`
    );

    // Free memory - no longer need full asset objects or dedup set
    allSubscriberAssets.clear();
    existingKeyToAssetSet.clear();
  } catch (err: any) {
    console.log(`\n⚠️  DAS search failed: ${err.message}`);
    console.log(
      `   Continuing with ${keyToAssetInfos.length} hardcoded key_to_assets only.`
    );
  }

  const hardcodedCount = keyToAssetInfos.filter((k) => k.isHardcoded).length;
  const subscriberCount = keyToAssetInfos.filter((k) => !k.isHardcoded).length;
  console.log(
    `\nTotal: ${keyToAssetInfos.length.toLocaleString()} key_to_asset accounts (${hardcodedCount} hardcoded, ${subscriberCount.toLocaleString()} subscribers)`
  );

  // Extract entity keys (try URI first, fetch as fallback)
  console.log("Extracting entity keys from asset data...");

  const existingKeyToAssets: {
    keyToAsset: PublicKey;
    assetId: PublicKey;
    entityKey: Buffer;
    isHardcoded: boolean;
  }[] = [];

  const needsFetch: typeof keyToAssetInfos = [];

  // Try to extract from URI first
  keyToAssetInfos.forEach((info) => {
    if (info.entityKey) {
      // Hardcoded account - already have entity key
      existingKeyToAssets.push({
        keyToAsset: info.keyToAsset,
        assetId: info.assetId,
        entityKey: info.entityKey,
        isHardcoded: info.isHardcoded,
      });
    } else if (info.asset?.content?.json_uri) {
      // Try to extract from URI
      const entityKeyStr = info.asset.content.json_uri.split("/").slice(-1)[0];
      const cleanEntityKeyStr = entityKeyStr
        .split(".")[0]
        .split("?")[0]
        .split("#")[0];
      try {
        const entityKey = Buffer.from(bs58.decode(cleanEntityKeyStr));
        existingKeyToAssets.push({
          keyToAsset: info.keyToAsset,
          assetId: info.assetId,
          entityKey,
          isHardcoded: info.isHardcoded,
        });
      } catch (err: any) {
        // URI extraction failed - need to fetch
        needsFetch.push(info);
      }
    } else {
      // No URI - need to fetch
      needsFetch.push(info);
    }
  });

  console.log(
    `  Extracted ${existingKeyToAssets.length.toLocaleString()} entity keys from URIs`
  );

  // Fetch the ones that failed URI extraction
  if (needsFetch.length > 0) {
    console.log(
      `  Fetching ${needsFetch.length.toLocaleString()} keyToAssetV0 accounts (URI extraction failed)...`
    );

    async function fetchKeyToAssetsWithRetry(
      chunk: typeof needsFetch,
      maxRetries = 3
    ) {
      for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
          const accountInfos =
            await hemProgram.account.keyToAssetV0.fetchMultiple(
              chunk.map((k) => k.keyToAsset)
            );
          return { accountInfos, chunk };
        } catch (err: any) {
          if (attempt === maxRetries - 1) throw err;
          const delay = Math.min(1000 * Math.pow(2, attempt), 5000);
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
      throw new Error("Max retries exceeded");
    }

    const keyToAssetChunks = chunks(needsFetch, 100);
    const keyToAssetLimiter = pLimit(10);
    let keyToAssetFetchedCount = 0;
    let keyToAssetBatchIndex = 0;

    const keyToAssetBatchResults = await Promise.all(
      keyToAssetChunks.map((chunk) =>
        keyToAssetLimiter(async () => {
          const result = await fetchKeyToAssetsWithRetry(chunk);
          keyToAssetFetchedCount += chunk.length;
          keyToAssetBatchIndex++;

          // Show progress
          if (
            keyToAssetBatchIndex <= 3 ||
            keyToAssetBatchIndex % 10 === 0 ||
            keyToAssetFetchedCount === needsFetch.length
          ) {
            console.log(
              `    ${keyToAssetBatchIndex} batches: ${keyToAssetFetchedCount.toLocaleString()} accounts`
            );
          }

          return result;
        })
      )
    );

    // Process fetched accounts
    keyToAssetBatchResults.forEach(({ accountInfos, chunk }) => {
      accountInfos.forEach((account, index) => {
        if (account) {
          existingKeyToAssets.push({
            keyToAsset: chunk[index].keyToAsset,
            assetId: chunk[index].assetId,
            entityKey: Buffer.from(account.entityKey),
            isHardcoded: chunk[index].isHardcoded,
          });
        }
      });
    });

    console.log(
      `  Fetched ${keyToAssetFetchedCount.toLocaleString()} entity keys from accounts`
    );
  }

  console.log(
    `  Total: ${existingKeyToAssets.length.toLocaleString()} entity keys\n`
  );

  // Free memory - no longer need original key_to_asset infos or assets
  keyToAssetInfos.length = 0;

  // ========== STEP 2: Claim all rewards until none remain ==========
  console.log("\n=== STEP 2: CLAIMING REWARDS ===\n");

  let claimIteration = 0;
  let totalClaimedMobile = new BN(0);
  let totalClaimedHnt = new BN(0);
  let totalClaimedTransactions = 0;

  // Build recipient lookup for both mobile and hnt lazy distributors
  console.log(
    `Computing recipient PDAs for ${existingKeyToAssets.length.toLocaleString()} assets...`
  );

  const existingRecipients = new Map<
    string,
    { mobile: boolean; hnt: boolean }
  >();

  // Pre-compute asset ID strings to avoid repeated .toBase58() calls
  const assetIdStrings: string[] = [];
  const mobileRecipientKeys: PublicKey[] = [];
  const hntRecipientKeys: PublicKey[] = [];
  existingKeyToAssets.forEach(({ assetId }) => {
    assetIdStrings.push(assetId.toBase58());
    mobileRecipientKeys.push(recipientKey(mobileLazyDistributor, assetId)[0]);
    hntRecipientKeys.push(recipientKey(hntLazyDistributor, assetId)[0]);
  });

  console.log(
    `  Done: ${mobileRecipientKeys.length.toLocaleString()} MOBILE + ${hntRecipientKeys.length.toLocaleString()} HNT keys\n`
  );

  async function fetchRecipientsWithRetry(chunk: PublicKey[], maxRetries = 3) {
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const accountInfos =
          await lazyProgram.account.recipientV0.fetchMultiple(chunk);
        return { accountInfos, chunk };
      } catch (err: any) {
        if (attempt === maxRetries - 1) throw err;
        const delay = Math.min(1000 * Math.pow(2, attempt), 5000);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
    throw new Error("Max retries exceeded");
  }

  // Fetch mobile and hnt recipients in parallel
  console.log("  Checking MOBILE and HNT recipients in parallel...");
  const mobileRecipientChunks = chunks(mobileRecipientKeys, 1000);
  const hntRecipientChunks = chunks(hntRecipientKeys, 1000);
  const limiter = pLimit(10);
  let mobileFetchedCount = 0;
  let hntFetchedCount = 0;
  let mobileBatchIndex = 0;
  let hntBatchIndex = 0;
  let mobileRecipientsCount = 0;
  let hntRecipientsCount = 0;

  await Promise.all([
    // Fetch mobile recipients
    Promise.all(
      mobileRecipientChunks.map((chunk, chunkIndex) =>
        limiter(async () => {
          const result = await fetchRecipientsWithRetry(chunk);
          mobileFetchedCount += chunk.length;
          mobileBatchIndex++;

          // Calculate starting index for this chunk
          const chunkStartIndex = chunkIndex * 1000;

          // Track which assets have mobile recipients
          result.accountInfos.forEach((info, index) => {
            if (info) {
              const assetKey = assetIdStrings[chunkStartIndex + index];
              const existing = existingRecipients.get(assetKey) || {
                mobile: false,
                hnt: false,
              };
              existing.mobile = true;
              existingRecipients.set(assetKey, existing);
              mobileRecipientsCount++;
            }
          });

          // Show progress: first 3 batches, then every 25 batches
          if (
            mobileBatchIndex <= 3 ||
            mobileBatchIndex % 25 === 0 ||
            mobileFetchedCount === mobileRecipientKeys.length
          ) {
            console.log(
              `    MOBILE ${mobileBatchIndex} batches: ${mobileFetchedCount.toLocaleString()} accounts`
            );
          }

          return result;
        })
      )
    ),
    // Fetch hnt recipients
    Promise.all(
      hntRecipientChunks.map((chunk, chunkIndex) =>
        limiter(async () => {
          const result = await fetchRecipientsWithRetry(chunk);
          hntFetchedCount += chunk.length;
          hntBatchIndex++;

          // Calculate starting index for this chunk
          const chunkStartIndex = chunkIndex * 1000;

          // Track which assets have hnt recipients
          result.accountInfos.forEach((info, index) => {
            if (info) {
              const assetKey = assetIdStrings[chunkStartIndex + index];
              const existing = existingRecipients.get(assetKey) || {
                mobile: false,
                hnt: false,
              };
              existing.hnt = true;
              existingRecipients.set(assetKey, existing);
              hntRecipientsCount++;
            }
          });

          // Show progress: first 3 batches, then every 25 batches
          if (
            hntBatchIndex <= 3 ||
            hntBatchIndex % 25 === 0 ||
            hntFetchedCount === hntRecipientKeys.length
          ) {
            console.log(
              `    HNT ${hntBatchIndex} batches: ${hntFetchedCount.toLocaleString()} accounts`
            );
          }

          return result;
        })
      )
    ),
  ]);

  console.log(
    `    Found ${mobileRecipientsCount.toLocaleString()} MOBILE recipients, ${hntRecipientsCount.toLocaleString()} HNT recipients\n`
  );

  // Build assetsWithRecipients - assets that have at least one recipient
  const assetsWithRecipients: ((typeof existingKeyToAssets)[0] & {
    hasMobileRecipient: boolean;
    hasHntRecipient: boolean;
  })[] = [];
  existingKeyToAssets.forEach((asset) => {
    const recipients = existingRecipients.get(asset.assetId.toBase58());
    if (recipients && (recipients.mobile || recipients.hnt)) {
      assetsWithRecipients.push({
        ...asset,
        hasMobileRecipient: recipients.mobile,
        hasHntRecipient: recipients.hnt,
      });
    }
  });

  console.log(
    `  Total assets with recipients: ${assetsWithRecipients.length.toLocaleString()} (${mobileRecipientsCount.toLocaleString()} mobile, ${hntRecipientsCount.toLocaleString()} hnt)\n`
  );

  console.log(
    `Checking rewards for ${assetsWithRecipients.length.toLocaleString()} assets with recipients (skipping ${(
      existingKeyToAssets.length - assetsWithRecipients.length
    ).toLocaleString()} without recipients)\n`
  );

  while (true) {
    claimIteration++;
    console.log(`--- Claim Iteration ${claimIteration} ---`);

    // Check pending rewards using bulk API for both mobile and hnt
    let assetsWithRewards = 0;
    let assetsWithZeroRewards = 0;
    let totalPendingMobileRewards = new BN(0);
    let totalPendingHntRewards = new BN(0);
    const assetsToClaim: {
      asset: PublicKey;
      mobileRewards?: client.Reward[];
      hntRewards?: client.Reward[];
      hasMobileRecipient: boolean;
      hasHntRecipient: boolean;
    }[] = [];

    // Create map of entityKey -> asset info for lookup
    const entityKeyToAsset = new Map<
      string,
      {
        assetId: PublicKey;
        entityKey: Buffer;
        hasMobileRecipient: boolean;
        hasHntRecipient: boolean;
      }
    >();

    assetsWithRecipients.forEach(
      ({ assetId, entityKey, hasMobileRecipient, hasHntRecipient }) => {
        // Decode entity key to string format that oracle expects (b58 for subscriber assets)
        const entityKeyStr = decodeEntityKey(entityKey, { b58: {} });
        if (entityKeyStr) {
          entityKeyToAsset.set(entityKeyStr, {
            assetId,
            entityKey,
            hasMobileRecipient,
            hasHntRecipient,
          });
        }
      }
    );

    // Get bulk rewards in chunks
    const entityKeys = Array.from(entityKeyToAsset.keys());
    const rewardsChunks = chunks(entityKeys, 5000);
    const rewardsLimiter = pLimit(5);

    // Fetch mobile and hnt rewards in parallel
    console.log("  Checking MOBILE and HNT rewards in parallel...");
    let mobileCheckedCount = 0;
    let hntCheckedCount = 0;
    let mobileRewardsBatchIndex = 0;
    let hntRewardsBatchIndex = 0;

    const [mobileBulkRewardsResults, hntBulkRewardsResults] = await Promise.all(
      [
        // Fetch mobile rewards
        Promise.all(
          rewardsChunks.map((chunk) =>
            rewardsLimiter(async () => {
              try {
                const bulkRewards = await client.getBulkRewards(
                  lazyProgram,
                  mobileLazyDistributor,
                  chunk
                );

                mobileRewardsBatchIndex++;
                mobileCheckedCount += chunk.length;

                // Show progress
                if (
                  mobileRewardsBatchIndex <= 3 ||
                  mobileRewardsBatchIndex % 5 === 0 ||
                  mobileCheckedCount === entityKeys.length
                ) {
                  console.log(
                    `    MOBILE ${mobileRewardsBatchIndex} batches: ${mobileCheckedCount.toLocaleString()} assets`
                  );
                }

                return { chunk, bulkRewards };
              } catch (err: any) {
                console.error(
                  `Error fetching mobile bulk rewards: ${err.message}`
                );
                return { chunk, bulkRewards: [] };
              }
            })
          )
        ),
        // Fetch hnt rewards
        Promise.all(
          rewardsChunks.map((chunk) =>
            rewardsLimiter(async () => {
              try {
                const bulkRewards = await client.getBulkRewards(
                  lazyProgram,
                  hntLazyDistributor,
                  chunk
                );

                hntRewardsBatchIndex++;
                hntCheckedCount += chunk.length;

                // Show progress
                if (
                  hntRewardsBatchIndex <= 3 ||
                  hntRewardsBatchIndex % 5 === 0 ||
                  hntCheckedCount === entityKeys.length
                ) {
                  console.log(
                    `    HNT ${hntRewardsBatchIndex} batches: ${hntCheckedCount.toLocaleString()} assets`
                  );
                }

                return { chunk, bulkRewards };
              } catch (err: any) {
                console.error(
                  `Error fetching hnt bulk rewards: ${err.message}`
                );
                return { chunk, bulkRewards: [] };
              }
            })
          )
        ),
      ]
    );

    // Merge bulk rewards from all chunks for mobile
    const mergedMobileBulkRewards: client.BulkRewards[] = [];

    if (
      mobileBulkRewardsResults.length > 0 &&
      mobileBulkRewardsResults[0].bulkRewards.length > 0
    ) {
      const numOracles = mobileBulkRewardsResults[0].bulkRewards.length;

      for (let oracleIdx = 0; oracleIdx < numOracles; oracleIdx++) {
        const mergedRewards: Record<string, string> = {};

        // Merge rewards from all chunks for this oracle
        mobileBulkRewardsResults.forEach(({ bulkRewards }) => {
          if (bulkRewards[oracleIdx]) {
            Object.assign(mergedRewards, bulkRewards[oracleIdx].currentRewards);
          }
        });

        mergedMobileBulkRewards.push({
          currentRewards: mergedRewards,
          oracleKey:
            mobileBulkRewardsResults[0].bulkRewards[oracleIdx].oracleKey,
        });
      }
    }

    // Merge bulk rewards from all chunks for hnt
    const mergedHntBulkRewards: client.BulkRewards[] = [];

    if (
      hntBulkRewardsResults.length > 0 &&
      hntBulkRewardsResults[0].bulkRewards.length > 0
    ) {
      const numOracles = hntBulkRewardsResults[0].bulkRewards.length;

      for (let oracleIdx = 0; oracleIdx < numOracles; oracleIdx++) {
        const mergedRewards: Record<string, string> = {};

        // Merge rewards from all chunks for this oracle
        hntBulkRewardsResults.forEach(({ bulkRewards }) => {
          if (bulkRewards[oracleIdx]) {
            Object.assign(mergedRewards, bulkRewards[oracleIdx].currentRewards);
          }
        });

        mergedHntBulkRewards.push({
          currentRewards: mergedRewards,
          oracleKey: hntBulkRewardsResults[0].bulkRewards[oracleIdx].oracleKey,
        });
      }
    }

    // Process rewards using merged bulk rewards
    entityKeys.forEach((entityKey) => {
      const assetInfo = entityKeyToAsset.get(entityKey);
      if (!assetInfo) return;

      // Aggregate mobile rewards across all oracles for this entity
      const mobileRewards: client.Reward[] = mergedMobileBulkRewards.map(
        (oracle) => ({
          currentRewards: oracle.currentRewards[entityKey] || "0",
          oracleKey: oracle.oracleKey,
        })
      );

      const totalMobileRewards = mobileRewards.reduce((sum, r) => {
        return sum.add(new BN(r.currentRewards));
      }, new BN(0));

      // Aggregate hnt rewards across all oracles for this entity
      const hntRewards: client.Reward[] = mergedHntBulkRewards.map(
        (oracle) => ({
          currentRewards: oracle.currentRewards[entityKey] || "0",
          oracleKey: oracle.oracleKey,
        })
      );

      const totalHntRewards = hntRewards.reduce((sum, r) => {
        return sum.add(new BN(r.currentRewards));
      }, new BN(0));

      const hasMobileRewards = totalMobileRewards.gt(new BN(0));
      const hasHntRewards = totalHntRewards.gt(new BN(0));

      if (hasMobileRewards || hasHntRewards) {
        assetsWithRewards++;
        totalPendingMobileRewards =
          totalPendingMobileRewards.add(totalMobileRewards);
        totalPendingHntRewards = totalPendingHntRewards.add(totalHntRewards);
        assetsToClaim.push({
          asset: assetInfo.assetId,
          mobileRewards: hasMobileRewards ? mobileRewards : undefined,
          hntRewards: hasHntRewards ? hntRewards : undefined,
          hasMobileRecipient: assetInfo.hasMobileRecipient,
          hasHntRecipient: assetInfo.hasHntRecipient,
        });
      } else {
        assetsWithZeroRewards++;
      }
    });

    console.log(
      `\nPending: ${assetsWithRewards} assets with ${toMobile(
        totalPendingMobileRewards
      )} MOBILE and ${toHnt(
        totalPendingHntRewards
      )} HNT (${assetsWithZeroRewards} with zero)`
    );

    // If no more rewards, break out of loop
    if (assetsWithRewards === 0) {
      console.log("\n✓ All rewards have been claimed!");
      break;
    }

    console.log(`\nClaiming rewards for ${assetsWithRewards} assets...`);

    // Batch claim rewards using formBulkTransactions (up to 100 assets per call)
    console.log(`Preparing ${assetsToClaim.length} claim transactions...`);

    // Fetch both lazy distributor accounts once and reuse for all batches
    const mobileLazyDistributorAcc =
      await lazyProgram.account.lazyDistributorV0.fetch(mobileLazyDistributor);
    const hntLazyDistributorAcc =
      await lazyProgram.account.lazyDistributorV0.fetch(hntLazyDistributor);

    // Split claims into mobile and hnt
    const mobileClaimsToProcess = assetsToClaim.filter((c) => c.mobileRewards);
    const hntClaimsToProcess = assetsToClaim.filter((c) => c.hntRewards);

    console.log(
      `  ${mobileClaimsToProcess.length} mobile claims, ${hntClaimsToProcess.length} hnt claims`
    );

    async function formBulkTransactionsWithRetry(
      assets: PublicKey[],
      lazyDistributor: PublicKey,
      lazyDistributorAcc: any,
      mergedBulkRewards: client.BulkRewards[],
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
            wallet: authority.publicKey,
          });
        } catch (err: any) {
          const errorMsg = err.message || err.toString();
          const is400 = errorMsg.includes("400");
          const is502or503 =
            errorMsg.includes("502") || errorMsg.includes("503");

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
                first,
                lazyDistributor,
                lazyDistributorAcc,
                mergedBulkRewards,
                maxRetries
              ),
              formBulkTransactionsWithRetry(
                second,
                lazyDistributor,
                lazyDistributorAcc,
                mergedBulkRewards,
                maxRetries
              ),
            ]);
            return [...firstTxns, ...secondTxns];
          }

          // For single asset 400 errors, log and skip
          if (is400 && assets.length === 1) {
            console.error(
              `    Skipping problematic asset: ${assets[0].toBase58()}`
            );
            return [];
          }

          // For transient errors (502/503), retry with backoff
          if (is502or503 && attempt < maxRetries - 1) {
            const delay = Math.min(2000 * Math.pow(2, attempt), 30000);
            console.log(
              `    Error: ${errorMsg.substring(0, 80)}... retrying in ${
                delay / 1000
              }s (attempt ${attempt + 1}/${maxRetries})`
            );
            await new Promise((resolve) => setTimeout(resolve, delay));
            continue;
          }

          // Last attempt or other errors
          if (attempt === maxRetries - 1) throw err;
        }
      }
      throw new Error("Max retries exceeded");
    }

    const claimTxLimiter = pLimit(25);

    // Process mobile claims
    const mobileTxns: any[] = [];
    if (mobileClaimsToProcess.length > 0) {
      console.log("  Processing MOBILE claims...");
      const mobileClaimChunks = chunks(mobileClaimsToProcess, 100);
      let mobilePreparedCount = 0;
      let mobileBatchIndex = 0;

      const mobileBatchTxns = await Promise.all(
        mobileClaimChunks.map((chunk) =>
          claimTxLimiter(async () => {
            try {
              const assets = chunk.map((c) => c.asset);

              // Use formBulkTransactions which is more efficient than individual formTransaction calls
              const txns = await formBulkTransactionsWithRetry(
                assets,
                mobileLazyDistributor,
                mobileLazyDistributorAcc,
                mergedMobileBulkRewards
              );

              mobilePreparedCount += chunk.length;
              mobileBatchIndex++;

              // Show progress: first 3 batches, then every 25 batches, or at end
              if (
                mobileBatchIndex <= 3 ||
                mobileBatchIndex % 25 === 0 ||
                mobilePreparedCount === mobileClaimsToProcess.length
              ) {
                console.log(
                  `    ${mobileBatchIndex} batches: ${mobilePreparedCount.toLocaleString()} assets`
                );
              }

              return txns;
            } catch (err: any) {
              console.error(
                `Error forming mobile bulk transactions for batch after retries: ${err.message}`
              );
              return [];
            }
          })
        )
      );

      mobileTxns.push(...mobileBatchTxns.flat().filter(truthy));
    }

    // Process hnt claims
    const hntTxns: any[] = [];
    if (hntClaimsToProcess.length > 0) {
      console.log("  Processing HNT claims...");
      const hntClaimChunks = chunks(hntClaimsToProcess, 100);
      let hntPreparedCount = 0;
      let hntBatchIndex = 0;

      const hntBatchTxns = await Promise.all(
        hntClaimChunks.map((chunk) =>
          claimTxLimiter(async () => {
            try {
              const assets = chunk.map((c) => c.asset);

              // Use formBulkTransactions which is more efficient than individual formTransaction calls
              const txns = await formBulkTransactionsWithRetry(
                assets,
                hntLazyDistributor,
                hntLazyDistributorAcc,
                mergedHntBulkRewards
              );

              hntPreparedCount += chunk.length;
              hntBatchIndex++;

              // Show progress: first 3 batches, then every 25 batches, or at end
              if (
                hntBatchIndex <= 3 ||
                hntBatchIndex % 25 === 0 ||
                hntPreparedCount === hntClaimsToProcess.length
              ) {
                console.log(
                  `    ${hntBatchIndex} batches: ${hntPreparedCount.toLocaleString()} assets`
                );
              }

              return txns;
            } catch (err: any) {
              console.error(
                `Error forming hnt bulk transactions for batch after retries: ${err.message}`
              );
              return [];
            }
          })
        )
      );

      hntTxns.push(...hntBatchTxns.flat().filter(truthy));
    }

    const txns = [...mobileTxns, ...hntTxns];

    console.log(`Prepared ${txns.length} transactions`);

    if (!argv.commit) {
      console.log(
        `\nDry run: would send ${txns.length} transactions to claim rewards for ${assetsWithRewards} assets`
      );
      break;
    }

    console.log(`Sending ${txns.length} transactions...`);

    for (const tx of txns) {
      tx.sign([authority]);
    }

    await bulkSendRawTransactions(
      provider.connection,
      txns.map((tx) => Buffer.from(tx.serialize())),
      (status) => {
        // Only show every 10 batches for mainnet scale
        if (
          status.totalProgress % 10 === 0 ||
          status.totalProgress === txns.length
        ) {
          console.log(`  Sent ${status.totalProgress} / ${txns.length}`);
        }
      }
    );

    totalClaimedMobile = totalClaimedMobile.add(totalPendingMobileRewards);
    totalClaimedHnt = totalClaimedHnt.add(totalPendingHntRewards);
    totalClaimedTransactions += txns.length;

    console.log(
      `Iteration ${claimIteration} complete. Claimed ${toMobile(
        totalPendingMobileRewards
      )} MOBILE and ${toHnt(totalPendingHntRewards)} HNT across ${
        txns.length
      } transactions.`
    );

    // Free memory for next iteration
    assetsToClaim.length = 0;
    txns.length = 0;

    // Wait a bit before next iteration to let chain settle
    console.log("\nWaiting 5 seconds before next check...");
    await new Promise((resolve) => setTimeout(resolve, 5000));
  }

  console.log(
    `\nClaimed ${toMobile(totalClaimedMobile)} MOBILE and ${toHnt(
      totalClaimedHnt
    )} HNT in ${claimIteration} iteration(s), ${totalClaimedTransactions} tx(s)`
  );

  // Free memory - no longer need recipient data
  existingRecipients.clear();
  mobileRecipientKeys.length = 0;
  hntRecipientKeys.length = 0;

  // ========== STEP 3: Close all KeyToAssetV0 accounts ==========
  console.log("\n=== STEP 3: CLOSING ACCOUNTS ===\n");

  console.log(
    `Preparing to close ${existingKeyToAssets.length.toLocaleString()} accounts...`
  );

  // Build close instructions
  const instructions: TransactionInstruction[] = [];

  // Separate hardcoded (need info checks) from subscribers (no checks needed)
  const hardcodedAccountsToClose = existingKeyToAssets.filter(
    (k) => k.isHardcoded
  );
  const subscriberAccounts = existingKeyToAssets.filter((k) => !k.isHardcoded);

  console.log(
    `  Hardcoded: ${
      hardcodedAccountsToClose.length
    }, Subscribers: ${subscriberAccounts.length.toLocaleString()}`
  );

  // Process hardcoded accounts (check info accounts)
  if (hardcodedAccountsToClose.length > 0) {
    console.log("Processing hardcoded accounts...");
    for (const { keyToAsset, assetId, entityKey } of hardcodedAccountsToClose) {
      const [mobileInfo] = mobileInfoKey(mobileConfig, entityKey);
      const [iotInfo] = iotInfoKey(iotConfig, entityKey);

      const [mobileInfoAcc, iotInfoAcc] = await Promise.all([
        provider.connection.getAccountInfo(mobileInfo),
        provider.connection.getAccountInfo(iotInfo),
      ]);

      console.log(`  ${keyToAsset.toBase58()}`);
      console.log(
        `    Mobile Info: ${
          mobileInfoAcc ? "exists (will close)" : "does not exist"
        }`
      );
      console.log(
        `    IoT Info: ${iotInfoAcc ? "exists (will close)" : "does not exist"}`
      );

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

  // Process subscriber accounts (no info checks - they shouldn't have info accounts)
  if (subscriberAccounts.length > 0) {
    console.log(
      `Processing ${subscriberAccounts.length.toLocaleString()} subscriber accounts...`
    );

    let processed = 0;
    const subscriberChunks = chunks(subscriberAccounts, 10000);
    const allBatchInstructions = await Promise.all(
      subscriberChunks.map(async (chunk) => {
        const batchInstructions = await Promise.all(
          chunk.map(async ({ keyToAsset, assetId, entityKey }) => {
            const [mobileInfo] = mobileInfoKey(mobileConfig, entityKey);
            const [iotInfo] = iotInfoKey(iotConfig, entityKey);

            return await hemProgram.methods
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
        );

        processed += chunk.length;

        // Show progress every chunk
        console.log(
          `  Prepared ${processed.toLocaleString()} / ${subscriberAccounts.length.toLocaleString()} instructions...`
        );

        return batchInstructions;
      })
    );

    instructions.push(...allBatchInstructions.flat().filter(truthy));
  }

  console.log(
    `\nBatching ${instructions.length.toLocaleString()} instructions into transactions...`
  );

  // Save counts before clearing memory
  const totalAccountsToClose = existingKeyToAssets.length;
  const hardcodedToClose = hardcodedAccountsToClose.length;
  const subscribersToClose = subscriberAccounts.length;

  // Free memory - no longer need existingKeyToAssets
  existingKeyToAssets.length = 0;
  const closeTxns = await batchInstructionsToTxsWithPriorityFee(
    provider,
    instructions,
    {
      useFirstEstimateForAll: true,
      computeUnitLimit: 600000,
    }
  );

  // Free memory - instructions now in transactions
  instructions.length = 0;
  console.log(`\nPrepared ${closeTxns.length} transactions`);

  if (!argv.commit) {
    console.log(
      `\nDry run: would send ${closeTxns.length} transactions to close ${totalAccountsToClose} accounts (${hardcodedToClose} hardcoded, ${subscribersToClose} subscribers)`
    );
    console.log(`\nRe-run with --commit to execute`);
    console.log(
      `Then run close-all-subscriber-recipients to close RecipientV0 accounts`
    );
    return;
  }

  console.log(`Sending ${closeTxns.length} transactions...`);

  // Sign with authority and send
  await bulkSendTransactions(
    provider,
    closeTxns,
    (status) => {
      console.log(
        `Sending ${status.currentBatchProgress} / ${status.currentBatchSize} in batch. ${status.totalProgress} / ${closeTxns.length}`
      );
    },
    10,
    [authority]
  );

  console.log(
    `\n✓ Complete: Claimed ${toMobile(totalClaimedMobile)} MOBILE and ${toHnt(
      totalClaimedHnt
    )} HNT, closed ${instructions.length} accounts`
  );
  console.log(`Next: run close-all-subscriber-recipients`);
}
