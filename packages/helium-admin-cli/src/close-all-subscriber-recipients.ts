import * as anchor from "@coral-xyz/anchor";
import {
  init as initHem,
  keyToAssetForAsset,
} from "@helium/helium-entity-manager-sdk";
import { daoKey } from "@helium/helium-sub-daos-sdk";
import {
  init as initLazy,
  lazyDistributorKey,
} from "@helium/lazy-distributor-sdk";
import { init as initRewards } from "@helium/rewards-oracle-sdk";
import { init as initMem } from "@helium/mobile-entity-manager-sdk";
import {
  HNT_MINT,
  MOBILE_MINT,
  getAssetBatch,
  batchInstructionsToTxsWithPriorityFee,
  bulkSendTransactions,
  chunks,
} from "@helium/spl-utils";
import { PublicKey, TransactionInstruction } from "@solana/web3.js";
import bs58 from "bs58";
import os from "os";
import pLimit from "p-limit";
import yargs from "yargs/yargs";
import { loadKeypair } from "./utils";

const PAGE_SIZE = 5000;
const BATCH_SIZE = 50000;

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
    approver: {
      type: "string",
      describe:
        "Path to the approver keypair (if lazy distributor has approver set)",
    },
    commit: {
      type: "boolean",
      describe: "Actually close accounts. Otherwise dry-run",
      default: false,
    },
  });
  const argv = await yarg.argv;

  process.env.ANCHOR_WALLET = argv.wallet as string;
  process.env.ANCHOR_PROVIDER_URL = argv.url as string;
  anchor.setProvider(anchor.AnchorProvider.local(argv.url as string));
  const provider = anchor.getProvider() as anchor.AnchorProvider;

  const lazyProgram = await initLazy(provider);
  const rewardsOracleProgram = await initRewards(provider);
  const memProgram = await initMem(provider);
  const hemProgram = await initHem(provider);

  const authority = argv.authority
    ? loadKeypair(argv.authority as string)
    : loadKeypair(argv.wallet as string);
  const approver = argv.approver ? loadKeypair(argv.approver as string) : null;

  const dao = daoKey(HNT_MINT)[0];
  const mobileLazyDistributor = lazyDistributorKey(MOBILE_MINT)[0];
  const hntLazyDistributor = lazyDistributorKey(HNT_MINT)[0];

  // Fetch all subscriber collections
  console.log(
    "Fetching CarrierV0 accounts to identify subscriber collections..."
  );
  const carriers = await memProgram.account.carrierV0.all();
  const subscriberCollections = new Set<string>();
  for (const carrier of carriers) {
    subscriberCollections.add(carrier.account.collection.toBase58());
  }
  console.log(
    `  Found ${subscriberCollections.size} subscriber collection(s) from ${carriers.length} carriers\n`
  );

  const subscriberRecipients: {
    address: PublicKey;
    asset: any;
    recipientData: any;
    lazyDistributor: PublicKey;
    distributorType: "MOBILE" | "HNT";
  }[] = [];

  async function fetchAssetBatchWithRetry(chunk: PublicKey[], maxRetries = 5) {
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const result = await getAssetBatch(
          provider.connection.rpcEndpoint,
          chunk
        );
        return result || [];
      } catch (err: any) {
        const is429 = err.message?.includes("429") || err.status === 429;
        if (attempt === maxRetries - 1 || !is429) {
          console.error(
            `Failed to fetch asset batch after ${maxRetries} attempts: ${err.message}`
          );
          return [];
        }
        // Exponential backoff for rate limits
        const delay = Math.min(2000 * Math.pow(2, attempt), 30000);
        console.log(`  Rate limited, retrying in ${delay / 1000}s...`);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
    return [];
  }

  async function processBatch(
    batch: any[],
    batchLabel: string,
    lazyDistributor: PublicKey,
    distributorType: "MOBILE" | "HNT"
  ): Promise<{ subscribers: number; nonSubscribers: number }> {
    console.log(`\n--- Processing ${batchLabel} ---`);

    const assetIds = batch.map((r) => r.account.asset);
    console.log(`Fetching ${assetIds.length.toLocaleString()} assets...`);

    // Fetch assets with concurrency control
    const assetChunks = chunks(assetIds, 1000);
    const assetLimiter = pLimit(10);
    let fetchedCount = 0;
    let assetBatchIndex = 0;

    const assetResults = await Promise.all(
      assetChunks.map((chunk) =>
        assetLimiter(async () => {
          const result = await fetchAssetBatchWithRetry(chunk);
          fetchedCount += chunk.length;
          assetBatchIndex++;

          if (assetBatchIndex % 10 === 0 || fetchedCount >= assetIds.length) {
            console.log(
              `  ${assetBatchIndex} batches: ${fetchedCount.toLocaleString()} assets`
            );
          }

          return result;
        })
      )
    );

    const assets = assetResults.flat();

    // Filter for subscriber assets
    console.log("Filtering for subscriber assets...");
    let batchNonSubscribers = 0;
    let batchSubscribers = 0;

    batch.forEach((recipient, index) => {
      const asset = assets[index];
      if (!asset) {
        batchNonSubscribers++;
        return;
      }

      const assetCollection = asset.grouping?.find(
        (g: any) => g.group_key === "collection"
      )?.group_value;

      if (
        assetCollection &&
        subscriberCollections.has(assetCollection.toBase58())
      ) {
        subscriberRecipients.push({
          address: recipient.publicKey,
          asset,
          recipientData: recipient.account,
          lazyDistributor,
          distributorType,
        });
        batchSubscribers++;
      } else {
        batchNonSubscribers++;
      }
    });

    return {
      subscribers: batchSubscribers,
      nonSubscribers: batchNonSubscribers,
    };
  }

  async function fetchAndProcessRecipients(
    lazyDistributor: PublicKey,
    distributorType: "MOBILE" | "HNT"
  ) {
    console.log(
      `\n=== Fetching RecipientV0 accounts for ${distributorType} lazy distributor ===\n`
    );

    let paginationKey: string | null = null;
    let page = 0;
    let totalRecipientsFetched = 0;
    let totalSkippedNonSubscriber = 0;
    let currentBatch: any[] = [];

    do {
      page++;

      // Fetch next page
      const response = await fetch(provider.connection.rpcEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: `page-${page}`,
          method: "getProgramAccountsV2",
          params: [
            lazyProgram.programId.toBase58(),
            {
              encoding: "base64",
              filters: [
                {
                  memcmp: {
                    offset: 8,
                    bytes: lazyDistributor.toBase58(),
                  },
                },
              ],
              limit: PAGE_SIZE,
              ...(paginationKey && { paginationKey }),
            },
          ],
        }),
      });

      const data = await response.json();
      if (data.error) {
        throw new Error(`RPC error: ${data.error.message}`);
      }

      const { result } = data;

      // If no more results, set paginationKey to null to end pagination
      if (!result || !result.accounts || result.accounts.length === 0) {
        paginationKey = null;
      } else {
        // Decode and add to current batch
        const pageRecipients = result.accounts.map((item: any) => ({
          publicKey: new PublicKey(item.pubkey),
          account: lazyProgram.coder.accounts.decode(
            "recipientV0",
            Buffer.from(item.account.data[0], "base64")
          ),
        }));

        currentBatch.push(...pageRecipients);
        totalRecipientsFetched += pageRecipients.length;

        if (page % 10 === 0) {
          console.log(
            `  Fetched ${totalRecipientsFetched.toLocaleString()} recipients (batch size: ${currentBatch.length.toLocaleString()})...`
          );
        }

        paginationKey = result.paginationKey || null;
      }

      // Process batch when we hit BATCH_SIZE or finished pagination
      const shouldProcessBatch =
        currentBatch.length >= BATCH_SIZE || !paginationKey;

      if (shouldProcessBatch && currentBatch.length > 0) {
        const { subscribers, nonSubscribers } = await processBatch(
          currentBatch,
          `batch of ${currentBatch.length.toLocaleString()} recipients`,
          lazyDistributor,
          distributorType
        );

        totalSkippedNonSubscriber += nonSubscribers;

        console.log(
          `Found ${subscriberRecipients.length.toLocaleString()} subscriber recipients so far (${subscribers} subscribers, ${nonSubscribers} non-subscribers in this batch)\n`
        );

        // Clear current batch to free memory
        currentBatch = [];
      }
    } while (paginationKey);

    console.log(`\n=== ${distributorType} Summary ===`);
    console.log(
      `Processed ${totalRecipientsFetched.toLocaleString()} total RecipientV0 accounts`
    );
    console.log(
      `${totalSkippedNonSubscriber.toLocaleString()} skipped (non-subscriber assets)`
    );
  }

  // Fetch recipients for both mobile and hnt lazy distributors
  await fetchAndProcessRecipients(mobileLazyDistributor, "MOBILE");
  await fetchAndProcessRecipients(hntLazyDistributor, "HNT");

  const mobileRecipientCount = subscriberRecipients.filter(
    (r) => r.distributorType === "MOBILE"
  ).length;
  const hntRecipientCount = subscriberRecipients.filter(
    (r) => r.distributorType === "HNT"
  ).length;

  console.log(`\n=== Total Summary ===`);
  console.log(
    `${subscriberRecipients.length.toLocaleString()} total subscriber recipients found`
  );
  console.log(`  ${mobileRecipientCount.toLocaleString()} MOBILE recipients`);
  console.log(`  ${hntRecipientCount.toLocaleString()} HNT recipients`);

  if (subscriberRecipients.length === 0) {
    console.log("\nNo subscriber recipient accounts to close.");
    return;
  }

  // Verify recipients still exist (idempotent - skips already closed)
  console.log(
    `\nVerifying ${subscriberRecipients.length.toLocaleString()} recipient accounts still exist...`
  );

  const recipientAddresses = subscriberRecipients.map((r) => r.address);
  const verifyChunks = chunks(recipientAddresses, 100);
  const verifyLimiter = pLimit(10);
  const existingRecipients = new Set<string>();

  await Promise.all(
    verifyChunks.map((chunk) =>
      verifyLimiter(async () => {
        try {
          const accounts = await lazyProgram.account.recipientV0.fetchMultiple(
            chunk
          );
          accounts.forEach((account: any, index: number) => {
            if (account) {
              existingRecipients.add(chunk[index].toBase58());
            }
          });
        } catch (err: any) {
          console.error(`Error verifying recipients: ${err.message}`);
        }
      })
    )
  );

  const validRecipients = subscriberRecipients.filter((r) =>
    existingRecipients.has(r.address.toBase58())
  );

  console.log(
    `  Found ${validRecipients.length.toLocaleString()} existing recipients (${
      subscriberRecipients.length - validRecipients.length
    } already closed)`
  );

  if (validRecipients.length === 0) {
    console.log("\nNo recipient accounts to close.");
    return;
  }

  // Verify keyToAsset accounts are closed (required by tempCloseRecipientWrapperV0)
  console.log(
    `\nVerifying ${validRecipients.length.toLocaleString()} keyToAsset accounts are closed...`
  );

  const keyToAssetAddresses = validRecipients.map((r) => {
    const keyToAsset = keyToAssetForAsset(r.asset, dao);
    return typeof keyToAsset === "string"
      ? new PublicKey(keyToAsset)
      : keyToAsset;
  });

  const keyToAssetChunks = chunks(keyToAssetAddresses, 100);
  const keyToAssetLimiter = pLimit(10);
  const existingKeyToAssets = new Set<string>();

  await Promise.all(
    keyToAssetChunks.map((chunk) =>
      keyToAssetLimiter(async () => {
        try {
          const accounts = await hemProgram.account.keyToAssetV0.fetchMultiple(
            chunk
          );
          accounts.forEach((account: any, index: number) => {
            if (account) {
              existingKeyToAssets.add(chunk[index].toBase58());
            }
          });
        } catch (err: any) {
          console.error(`Error verifying keyToAsset accounts: ${err.message}`);
        }
      })
    )
  );

  // Only process recipients where keyToAsset is CLOSED (instruction requires it)
  const recipientsWithClosedKeyToAsset = validRecipients.filter(
    (r, index) =>
      !existingKeyToAssets.has(keyToAssetAddresses[index].toBase58())
  );

  const skippedDueToOpenKeyToAsset =
    validRecipients.length - recipientsWithClosedKeyToAsset.length;
  console.log(
    `  Found ${recipientsWithClosedKeyToAsset.length.toLocaleString()} recipients with closed keyToAsset (${skippedDueToOpenKeyToAsset} skipped - keyToAsset not yet closed)`
  );

  if (recipientsWithClosedKeyToAsset.length === 0) {
    console.log(
      "\nNo recipient accounts to close (run claim-and-close-subscriber-key-to-assets first)."
    );
    return;
  }

  console.log(
    `\nPreparing to close ${recipientsWithClosedKeyToAsset.length.toLocaleString()} recipient accounts...`
  );

  // Build close instructions
  let failedCount = 0;
  let processed = 0;

  const recipientChunks = chunks(recipientsWithClosedKeyToAsset, 100);
  const instructionLimiter = pLimit(50);

  const allBatchResults = await Promise.all(
    recipientChunks.map((chunk) =>
      instructionLimiter(async () => {
        const batchResults = await Promise.all(
          chunk.map(async (recipient) => {
            try {
              const {
                address: recipientAddr,
                asset,
                lazyDistributor,
              } = recipient;

              // Compute the KeyToAssetV0 address
              const keyToAsset = keyToAssetForAsset(asset, dao);

              // Extract entity key from asset URI
              const entityKeyStr =
                asset.content.json_uri.split("/").pop() || "";
              const cleanEntityKeyStr = entityKeyStr.split(/[.?#]/)[0];
              const entityKeyBytes = Buffer.from(
                bs58.decode(cleanEntityKeyStr)
              );

              // Get oracle_signer PDA
              const [oracleSigner] = PublicKey.findProgramAddressSync(
                [Buffer.from("oracle_signer", "utf-8")],
                rewardsOracleProgram.programId
              );

              return await rewardsOracleProgram.methods
                .tempCloseRecipientWrapperV0({
                  entityKey: entityKeyBytes,
                  asset: new PublicKey(asset.id),
                })
                .accountsPartial({
                  lazyDistributor,
                  recipient: recipientAddr,
                  keyToAsset,
                  dao,
                  authority: authority.publicKey,
                  approver: approver?.publicKey || null,
                  oracleSigner,
                  lazyDistributorProgram: lazyProgram.programId,
                })
                .instruction();
            } catch (err: any) {
              console.error(
                `Error building instruction for recipient ${recipient.address.toBase58()}: ${
                  err.message
                }`
              );
              return null;
            }
          })
        );

        processed += chunk.length;
        const validResults = batchResults.filter((i) => i !== null);
        failedCount += chunk.length - validResults.length;

        // Show progress every 1000 recipients or at end
        if (
          processed % 1000 === 0 ||
          processed === recipientsWithClosedKeyToAsset.length
        ) {
          console.log(
            `  Prepared ${
              processed - failedCount
            } / ${recipientsWithClosedKeyToAsset.length.toLocaleString()} instructions (${failedCount} failed)...`
          );
        }

        return batchResults;
      })
    )
  );

  const instructions = allBatchResults
    .flat()
    .filter((i): i is TransactionInstruction => i !== null);

  const instructionCount = instructions.length;
  const finalMobileCount = recipientsWithClosedKeyToAsset.filter(
    (r) => r.distributorType === "MOBILE"
  ).length;
  const finalHntCount = recipientsWithClosedKeyToAsset.filter(
    (r) => r.distributorType === "HNT"
  ).length;

  // Free memory
  subscriberRecipients.length = 0;

  console.log(
    `\nBatching ${instructionCount.toLocaleString()} instructions into transactions...`
  );
  const txns = await batchInstructionsToTxsWithPriorityFee(
    provider,
    instructions,
    {
      useFirstEstimateForAll: true,
      computeUnitLimit: 600000,
    }
  );

  // Free memory - instructions now in transactions
  instructions.length = 0;

  console.log(`\nPrepared ${txns.length} transactions`);

  if (!argv.commit) {
    console.log(
      `\nDry run: would send ${
        txns.length
      } transactions to close ${instructionCount} subscriber recipient accounts (${finalMobileCount.toLocaleString()} mobile, ${finalHntCount.toLocaleString()} hnt)`
    );
    console.log(`\nRe-run with --commit to execute 🚀`);
    return;
  }

  console.log(`Sending ${txns.length} transactions...`);

  // Sign with authority and approver (if present)
  const extraSigners = [authority];
  if (approver) {
    extraSigners.push(approver);
  }

  await bulkSendTransactions(
    provider,
    txns,
    (status) => {
      console.log(
        `Sending ${status.currentBatchProgress} / ${status.currentBatchSize} in batch. ${status.totalProgress} / ${txns.length}`
      );
    },
    10,
    extraSigners
  );

  console.log(
    `\n✓ Complete: Closed ${instructionCount} recipient accounts (${finalMobileCount.toLocaleString()} mobile, ${finalHntCount.toLocaleString()} hnt)${
      failedCount > 0 ? ` - ${failedCount} failed to build instructions` : ""
    }`
  );
}
