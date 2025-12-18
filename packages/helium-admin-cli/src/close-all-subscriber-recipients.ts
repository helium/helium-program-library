import * as anchor from "@coral-xyz/anchor";
import {
  init as initHem,
  keyToAssetKey,
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
  bulkSendRawTransactions,
  toVersionedTx,
  populateMissingDraftInfo,
  chunks,
} from "@helium/spl-utils";
import { Connection, PublicKey, TransactionInstruction } from "@solana/web3.js";
import bs58 from "bs58";
import os from "os";
import pLimit from "p-limit";
import yargs from "yargs/yargs";
import { loadKeypair } from "./utils";

const PAGE_SIZE = 1000;
const BATCH_SIZE = 2500;

// Minimal data type for recipients
type SubscriberRecipient = {
  address: PublicKey;
  assetId: string;
  assetJsonUri: string;
  lazyDistributor: PublicKey;
};

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

  // Use fresh connection for sending
  const sendConnection = new Connection(
    provider.connection.rpcEndpoint,
    "confirmed"
  );

  // Sign with authority and approver (if present)
  const extraSigners = [authority];
  if (approver) {
    extraSigners.push(approver);
  }

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

  // Global counters
  let totalRecipientsFetched = 0;
  let totalSubscribersFound = 0;
  let totalNonSubscribers = 0;
  let totalAlreadyClosed = 0;
  let totalKeyToAssetOpen = 0;
  let totalInstructionsBuilt = 0;
  let totalInstructionsFailed = 0;
  let totalTxnsConfirmed = 0;
  let totalTxnsFailed = 0;

  // Helper to extract entity key from json_uri
  const getEntityKeyFromUri = (jsonUri: string): string => {
    const entityKeyStr = jsonUri.split("/").pop() || "";
    return entityKeyStr.split(/[.?#]/)[0];
  };

  async function fetchAssetBatchWithRetry(chunk: PublicKey[], maxRetries = 5) {
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const result = await getAssetBatch(
          provider.connection.rpcEndpoint,
          chunk
        );
        return result || [];
      } catch (err: any) {
        if (attempt === maxRetries - 1) {
          throw err;
        }
        const delay = Math.min(2000 * Math.pow(2, attempt), 30000);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
    throw new Error("Max retries exceeded");
  }

  // Process a batch: filter subscribers, verify, build instructions, send transactions
  async function processAndSendBatch(
    batch: any[],
    batchNum: number,
    lazyDistributor: PublicKey,
    distributorType: "MOBILE" | "HNT"
  ): Promise<void> {
    console.log(
      `\n--- ${distributorType} Batch ${batchNum}: ${batch.length.toLocaleString()} recipients ---`
    );

    // 1. Fetch assets for this batch
    const assetIds = batch.map((r) => r.account.asset);
    console.log(`  Fetching ${assetIds.length.toLocaleString()} assets...`);

    const assetChunks = chunks(assetIds, 100);
    const assetLimiter = pLimit(3);
    let fetchedCount = 0;

    const assetResults = await Promise.all(
      assetChunks.map((chunk) =>
        assetLimiter(async () => {
          const result = await fetchAssetBatchWithRetry(chunk);
          fetchedCount += chunk.length;
          if (fetchedCount % 500 === 0 || fetchedCount >= assetIds.length) {
            process.stdout.write(
              `\r  Fetched ${fetchedCount.toLocaleString()} / ${assetIds.length.toLocaleString()} assets`
            );
          }
          return result;
        })
      )
    );
    console.log(); // newline after progress

    const assets = assetResults.flat();
    assetResults.length = 0;

    // 2. Filter for SUBSCRIBER assets only
    const subscriberRecipients: SubscriberRecipient[] = [];
    let batchNonSubscribers = 0;

    batch.forEach((recipient, index) => {
      const asset = assets[index];
      if (!asset) {
        batchNonSubscribers++;
        return;
      }

      const assetCollection = asset.grouping?.find(
        (g: any) => g.group_key === "collection"
      )?.group_value;

      const assetSymbol = asset.content?.metadata?.symbol;
      const isSubscriber = assetSymbol === "SUBSCRIBER";

      if (
        isSubscriber &&
        assetCollection &&
        subscriberCollections.has(assetCollection.toBase58())
      ) {
        subscriberRecipients.push({
          address: recipient.publicKey,
          assetId:
            typeof asset.id === "string" ? asset.id : asset.id.toBase58(),
          assetJsonUri: asset.content?.json_uri || "",
          lazyDistributor,
        });
      } else {
        batchNonSubscribers++;
      }
    });

    totalNonSubscribers += batchNonSubscribers;
    totalSubscribersFound += subscriberRecipients.length;

    console.log(
      `  Found ${subscriberRecipients.length.toLocaleString()} subscribers, ${batchNonSubscribers.toLocaleString()} non-subscribers`
    );

    if (subscriberRecipients.length === 0) {
      return;
    }

    // 3. Verify recipients still exist (skip already closed)
    const recipientAddresses = subscriberRecipients.map((r) => r.address);
    const verifyChunks = chunks(recipientAddresses, 50);
    const verifyLimiter = pLimit(5);
    const existingRecipients = new Set<string>();

    await Promise.all(
      verifyChunks.map((chunk) =>
        verifyLimiter(async () => {
          try {
            const accounts =
              await lazyProgram.account.recipientV0.fetchMultiple(chunk);
            accounts.forEach((account: any, idx: number) => {
              if (account) {
                existingRecipients.add(chunk[idx].toBase58());
              }
            });
          } catch (err: any) {
            console.error(`  Error verifying recipients: ${err.message}`);
          }
        })
      )
    );

    const validRecipients = subscriberRecipients.filter((r) =>
      existingRecipients.has(r.address.toBase58())
    );
    const alreadyClosed = subscriberRecipients.length - validRecipients.length;
    totalAlreadyClosed += alreadyClosed;

    if (alreadyClosed > 0) {
      console.log(`  ${alreadyClosed} already closed`);
    }

    if (validRecipients.length === 0) {
      return;
    }

    // 4. Verify keyToAsset accounts are closed
    const keyToAssetAddresses = validRecipients.map((r) => {
      const entityKey = getEntityKeyFromUri(r.assetJsonUri);
      return keyToAssetKey(dao, entityKey, "b58")[0];
    });

    const keyToAssetChunks = chunks(keyToAssetAddresses, 50);
    const keyToAssetLimiter = pLimit(5);
    const existingKeyToAssets = new Set<string>();

    await Promise.all(
      keyToAssetChunks.map((chunk) =>
        keyToAssetLimiter(async () => {
          try {
            const accounts =
              await hemProgram.account.keyToAssetV0.fetchMultiple(chunk);
            accounts.forEach((account: any, idx: number) => {
              if (account) {
                existingKeyToAssets.add(chunk[idx].toBase58());
              }
            });
          } catch (err: any) {
            console.error(`  Error verifying keyToAsset: ${err.message}`);
          }
        })
      )
    );

    const recipientsReady = validRecipients.filter(
      (r, idx) => !existingKeyToAssets.has(keyToAssetAddresses[idx].toBase58())
    );
    const keyToAssetOpen = validRecipients.length - recipientsReady.length;
    totalKeyToAssetOpen += keyToAssetOpen;

    if (keyToAssetOpen > 0) {
      console.log(`  ${keyToAssetOpen} skipped (keyToAsset not yet closed)`);
    }

    if (recipientsReady.length === 0) {
      return;
    }

    // 5. Build instructions
    console.log(
      `  Building ${recipientsReady.length.toLocaleString()} instructions...`
    );

    const recipientChunks = chunks(recipientsReady, 50);
    const instructionLimiter = pLimit(10);
    let failedCount = 0;

    const [oracleSigner] = PublicKey.findProgramAddressSync(
      [Buffer.from("oracle_signer", "utf-8")],
      rewardsOracleProgram.programId
    );

    const allInstructions = await Promise.all(
      recipientChunks.map((chunk) =>
        instructionLimiter(async () => {
          const results = await Promise.all(
            chunk.map(async (recipient) => {
              try {
                const entityKey = getEntityKeyFromUri(recipient.assetJsonUri);
                const entityKeyBytes = Buffer.from(bs58.decode(entityKey));
                const keyToAsset = keyToAssetKey(dao, entityKey, "b58")[0];

                return await rewardsOracleProgram.methods
                  .tempCloseRecipientWrapperV0({
                    entityKey: entityKeyBytes,
                    asset: new PublicKey(recipient.assetId),
                  })
                  .accountsPartial({
                    lazyDistributor: recipient.lazyDistributor,
                    recipient: recipient.address,
                    keyToAsset,
                    dao,
                    authority: authority.publicKey,
                    approver: approver?.publicKey || null,
                    oracleSigner,
                    lazyDistributorProgram: lazyProgram.programId,
                  })
                  .instruction();
              } catch (err: any) {
                return null;
              }
            })
          );

          failedCount += results.filter((i) => i === null).length;
          return results;
        })
      )
    );

    const instructions = allInstructions
      .flat()
      .filter((i): i is TransactionInstruction => i !== null);

    totalInstructionsBuilt += instructions.length;
    totalInstructionsFailed += failedCount;

    if (instructions.length === 0) {
      console.log(`  No valid instructions`);
      return;
    }

    // 6. Batch into transactions
    console.log(
      `  Batching ${instructions.length.toLocaleString()} instructions...`
    );
    const txns = await batchInstructionsToTxsWithPriorityFee(
      provider,
      instructions,
      {
        useFirstEstimateForAll: true,
        computeUnitLimit: 600000,
      }
    );
    instructions.length = 0;

    console.log(`  Prepared ${txns.length} transactions`);

    if (!argv.commit) {
      console.log(`  (dry run - would send ${txns.length} transactions)`);
      return;
    }

    // 7. Sign and send transactions
    console.log(`  Sending ${txns.length} transactions...`);

    const recentBlockhash = await sendConnection.getLatestBlockhash(
      "confirmed"
    );

    const TX_SIGN_CHUNK = 100;
    const txChunks = chunks(txns, TX_SIGN_CHUNK);
    let batchConfirmed = 0;

    for (let txChunkIdx = 0; txChunkIdx < txChunks.length; txChunkIdx++) {
      const txChunk = txChunks[txChunkIdx];

      const signedTxns = await Promise.all(
        txChunk.map(async (draft) => {
          await populateMissingDraftInfo(provider.connection, draft);
          const tx = toVersionedTx({
            ...draft,
            recentBlockhash: recentBlockhash.blockhash,
          });
          tx.sign(extraSigners);
          return tx;
        })
      );

      try {
        const confirmedTxs = await bulkSendRawTransactions(
          sendConnection,
          signedTxns.map((tx) => Buffer.from(tx.serialize())),
          undefined,
          recentBlockhash.lastValidBlockHeight
        );

        batchConfirmed += confirmedTxs.length;
        totalTxnsConfirmed += confirmedTxs.length;

        if (txChunks.length > 1) {
          console.log(
            `    Chunk ${txChunkIdx + 1}/${txChunks.length}: ${
              confirmedTxs.length
            }/${txChunk.length} confirmed`
          );
        }
      } catch (err: any) {
        totalTxnsFailed += txChunk.length;
        console.error(`    Error sending chunk: ${err.message}`);
      }
    }

    console.log(`  ✓ ${batchConfirmed}/${txns.length} transactions confirmed`);
    txns.length = 0;
  }

  // Main processing loop for a distributor
  async function fetchAndProcessRecipients(
    lazyDistributor: PublicKey,
    distributorType: "MOBILE" | "HNT"
  ) {
    console.log(`\n=== Processing ${distributorType} lazy distributor ===\n`);

    let paginationKey: string | null = null;
    let page = 0;
    let distributorRecipientsFetched = 0;
    let currentBatch: any[] = [];
    let batchNum = 0;

    do {
      page++;

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
        paginationKey = null;
      } else {
        const pageRecipients = result.accounts.map((item: any) => ({
          publicKey: new PublicKey(item.pubkey),
          account: lazyProgram.coder.accounts.decode(
            "recipientV0",
            Buffer.from(item.account.data[0], "base64")
          ),
        }));

        currentBatch.push(...pageRecipients);
        distributorRecipientsFetched += pageRecipients.length;
        totalRecipientsFetched += pageRecipients.length;

        if (page % 10 === 0) {
          console.log(
            `  Fetched ${distributorRecipientsFetched.toLocaleString()} recipients...`
          );
        }

        paginationKey = result.paginationKey || null;
      }

      // Process batch when full or finished
      const shouldProcessBatch =
        currentBatch.length >= BATCH_SIZE || !paginationKey;

      if (shouldProcessBatch && currentBatch.length > 0) {
        batchNum++;
        await processAndSendBatch(
          currentBatch,
          batchNum,
          lazyDistributor,
          distributorType
        );
        currentBatch = [];
      }
    } while (paginationKey);

    console.log(`\n=== ${distributorType} Complete ===`);
    console.log(
      `  Processed ${distributorRecipientsFetched.toLocaleString()} total recipients`
    );
  }

  // Process both distributors
  await fetchAndProcessRecipients(mobileLazyDistributor, "MOBILE");
  await fetchAndProcessRecipients(hntLazyDistributor, "HNT");

  // Final summary
  console.log(`\n========================================`);
  console.log(`           FINAL SUMMARY`);
  console.log(`========================================`);
  console.log(
    `Total recipients fetched:    ${totalRecipientsFetched.toLocaleString()}`
  );
  console.log(
    `  Subscribers found:         ${totalSubscribersFound.toLocaleString()}`
  );
  console.log(
    `  Non-subscribers skipped:   ${totalNonSubscribers.toLocaleString()}`
  );
  console.log(
    `  Already closed:            ${totalAlreadyClosed.toLocaleString()}`
  );
  console.log(
    `  KeyToAsset not closed:     ${totalKeyToAssetOpen.toLocaleString()}`
  );
  console.log(
    `Instructions built:          ${totalInstructionsBuilt.toLocaleString()}`
  );
  if (totalInstructionsFailed > 0) {
    console.log(
      `  Failed to build:           ${totalInstructionsFailed.toLocaleString()}`
    );
  }

  if (!argv.commit) {
    console.log(`\nDry run complete. Re-run with --commit to execute 🚀`);
  } else {
    console.log(
      `Transactions confirmed:      ${totalTxnsConfirmed.toLocaleString()}`
    );
    if (totalTxnsFailed > 0) {
      console.log(
        `  Failed:                    ${totalTxnsFailed.toLocaleString()}`
      );
    }
    console.log(`\n✓ Complete 🎉`);
  }
}
