import * as anchor from "@coral-xyz/anchor";
import { keyToAssetForAsset } from "@helium/helium-entity-manager-sdk";
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

  const authority = argv.authority
    ? loadKeypair(argv.authority as string)
    : loadKeypair(argv.wallet as string);
  const approver = argv.approver ? loadKeypair(argv.approver as string) : null;

  const dao = daoKey(HNT_MINT)[0];
  const lazyDistributor = lazyDistributorKey(MOBILE_MINT)[0];

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

  console.log(
    "Fetching RecipientV0 accounts for MOBILE lazy distributor using pagination..."
  );

  const PAGE_SIZE = 5000; // Helius supports up to 5k per page for getProgramAccountsV2
  const BATCH_SIZE = 50000; // Process in 50k chunks to avoid memory issues

  let paginationKey: string | null = null;
  let page = 0;
  let totalRecipientsFetched = 0;
  let totalSkippedMissingAsset = 0;
  let totalSkippedNonSubscriber = 0;
  let currentBatch: any[] = [];
  const subscriberRecipients: {
    address: PublicKey;
    asset: any;
    recipientData: any;
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

  // Pagination and batch processing loop
  console.log(
    "Fetching recipients with pagination and processing in batches...\n"
  );

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
    if (!result || !result.accounts || result.accounts.length === 0) {
      break;
    }

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

    // Process batch when we hit BATCH_SIZE or finished pagination
    const shouldProcessBatch =
      currentBatch.length >= BATCH_SIZE || !paginationKey;

    if (shouldProcessBatch && currentBatch.length > 0) {
      console.log(
        `\n--- Processing batch of ${currentBatch.length.toLocaleString()} recipients ---`
      );

      // Get asset IDs
      const assetIds = currentBatch.map((r) => r.account.asset);
      console.log(`Fetching ${assetIds.length.toLocaleString()} assets...`);

      // Fetch assets
      const assetChunks = chunks(assetIds, 1000);
      const assetLimiter = pLimit(5);
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

            await new Promise((resolve) => setTimeout(resolve, 100));
            return result;
          })
        )
      );

      const assets = assetResults.flat();

      // Filter for subscriber assets by checking against subscriber collections
      console.log("Filtering for subscriber assets...");
      let batchSkippedNonSubscriber = 0;
      let batchSkippedMissingAsset = 0;

      currentBatch.forEach((recipient, index) => {
        const asset = assets[index];
        if (!asset) {
          batchSkippedMissingAsset++;
          totalSkippedMissingAsset++;
          return;
        }

        // Check if asset belongs to a subscriber collection
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
          });
        } else {
          batchSkippedNonSubscriber++;
          totalSkippedNonSubscriber++;
        }
      });

      console.log(
        `Found ${subscriberRecipients.length.toLocaleString()} subscriber recipients so far (${batchSkippedMissingAsset} missing assets, ${batchSkippedNonSubscriber} non-subscribers)\n`
      );

      // Clear current batch to free memory
      currentBatch = [];
    }

    await new Promise((resolve) => setTimeout(resolve, 100));
  } while (paginationKey);

  // Process any remaining batch
  if (currentBatch.length > 0) {
    console.log(
      `\n--- Processing final batch of ${currentBatch.length.toLocaleString()} recipients ---`
    );

    const assetIds = currentBatch.map((r) => r.account.asset);
    console.log(`Fetching ${assetIds.length.toLocaleString()} assets...`);

    const assetChunks = chunks(assetIds, 1000);
    const assetLimiter = pLimit(5);
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

          await new Promise((resolve) => setTimeout(resolve, 100));
          return result;
        })
      )
    );

    const assets = assetResults.flat();

    console.log("Filtering for subscriber assets...");
    let batchSkippedNonSubscriber = 0;
    let batchSkippedMissingAsset = 0;

    currentBatch.forEach((recipient, index) => {
      const asset = assets[index];
      if (!asset) {
        batchSkippedMissingAsset++;
        totalSkippedMissingAsset++;
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
        });
      } else {
        batchSkippedNonSubscriber++;
        totalSkippedNonSubscriber++;
      }
    });

    console.log(
      `Found ${subscriberRecipients.length.toLocaleString()} subscriber recipients total (${batchSkippedMissingAsset} missing assets, ${batchSkippedNonSubscriber} non-subscribers in final batch)\n`
    );
  }

  console.log(`\n=== Summary ===`);
  console.log(
    `Processed ${totalRecipientsFetched.toLocaleString()} total RecipientV0 accounts`
  );
  console.log(
    `${subscriberRecipients.length.toLocaleString()} are for subscriber assets`
  );
  console.log(
    `${totalSkippedNonSubscriber.toLocaleString()} skipped (non-subscriber assets)`
  );

  if (!argv.commit) {
    console.log(
      `\nDry run: would close ${subscriberRecipients.length} subscriber recipient accounts. Re-run with --commit to close recipients.`
    );
    return;
  }

  if (subscriberRecipients.length === 0) {
    console.log("\nNo subscriber recipient accounts to close.");
    return;
  }

  console.log(
    `\nClosing ${subscriberRecipients.length.toLocaleString()} recipient accounts...`
  );

  // Build close instructions
  let failedCount = 0;
  let processed = 0;

  const recipientChunks = chunks(subscriberRecipients, 100);
  const instructionLimiter = pLimit(25);

  const allBatchResults = await Promise.all(
    recipientChunks.map((chunk) =>
      instructionLimiter(async () => {
        const batchResults = await Promise.all(
          chunk.map(async (recipient) => {
            const { address: recipientAddr, asset } = recipient;
            try {
              // Compute the KeyToAssetV0 address (should be closed already)
              const keyToAsset = keyToAssetForAsset(asset, dao);

              // Get the entity key from the asset (try URI extraction)
              let entityKeyBytes: Buffer;
              try {
                const entityKeyStr = asset.content.json_uri
                  .split("/")
                  .slice(-1)[0] as string;
                const cleanEntityKeyStr = entityKeyStr
                  .split(".")[0]
                  .split("?")[0]
                  .split("#")[0];
                entityKeyBytes = Buffer.from(bs58.decode(cleanEntityKeyStr));
              } catch (uriError: any) {
                // URI extraction failed - this shouldn't happen for subscriber assets
                console.error(
                  `Failed to extract entity key from URI for recipient ${recipientAddr.toBase58()}: ${
                    uriError.message
                  }`
                );
                return null;
              }

              // Get oracle_signer PDA
              const [oracleSigner] = PublicKey.findProgramAddressSync(
                [Buffer.from("oracle_signer", "utf-8")],
                rewardsOracleProgram.programId
              );

              return await rewardsOracleProgram.methods
                .tempCloseRecipientWrapperV0({
                  entityKey: entityKeyBytes,
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
                `Error building instruction for recipient ${recipientAddr.toBase58()}: ${
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
          processed === subscriberRecipients.length
        ) {
          console.log(
            `  Prepared ${
              processed - failedCount
            } / ${subscriberRecipients.length.toLocaleString()} instructions (${failedCount} failed)...`
          );
        }

        return batchResults;
      })
    )
  );

  const instructions = allBatchResults
    .flat()
    .filter((i): i is TransactionInstruction => i !== null);

  const subscriberCount = subscriberRecipients.length;

  // Free memory
  subscriberRecipients.length = 0;

  console.log(
    `\nBatching ${instructions.length.toLocaleString()} instructions into transactions...`
  );

  const instructionCount = instructions.length;
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

  console.log(`\nSending ${txns.length} transactions...`);

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
    `\n✓ Complete: Closed ${instructionCount} recipient accounts${
      failedCount > 0 ? ` (${failedCount} failed to build instructions)` : ""
    }`
  );
}
