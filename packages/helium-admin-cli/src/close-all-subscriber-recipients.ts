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
import {
  HNT_MINT,
  MOBILE_MINT,
  batchInstructionsToTxsWithPriorityFee,
  bulkSendRawTransactions,
  toVersionedTx,
  populateMissingDraftInfo,
  chunks,
} from "@helium/spl-utils";
import { Connection, PublicKey, TransactionInstruction } from "@solana/web3.js";
import bs58 from "bs58";
import fs from "fs";
import os from "os";
import pLimit from "p-limit";
import yargs from "yargs/yargs";
import { loadKeypair } from "./utils";

const BATCH_SIZE = 2500;

interface JsonEntry {
  address: string;
  asset: string;
  hntRecipientKey: string;
  mobileRecipientKey: string;
  hntSignatureCount: number;
  mobileSignatureCount: number;
  encodedEntityKey: string;
}

type SubscriberRecipient = {
  address: PublicKey;
  assetId: string;
  entityKey: string;
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
  const hemProgram = await initHem(provider);

  const authority = argv.authority
    ? loadKeypair(argv.authority as string)
    : loadKeypair(argv.wallet as string);

  const dao = daoKey(HNT_MINT)[0];
  const mobileLazyDistributor = lazyDistributorKey(MOBILE_MINT)[0];
  const hntLazyDistributor = lazyDistributorKey(HNT_MINT)[0];

  const sendConnection = new Connection(
    provider.connection.rpcEndpoint,
    "confirmed"
  );

  const extraSigners = [authority];

  // Read input file
  const inputPath = argv.inputFile as string;
  console.log(`Reading input file: ${inputPath}\n`);
  const rawData = fs.readFileSync(inputPath, "utf-8");
  const entries: JsonEntry[] = JSON.parse(rawData);
  console.log(
    `Loaded ${entries.length.toLocaleString()} entries from JSON file\n`
  );

  // Global counters
  let totalRecipientsProcessed = 0;
  let totalAlreadyClosed = 0;
  let totalKeyToAssetOpen = 0;
  let totalInstructionsBuilt = 0;
  let totalInstructionsFailed = 0;
  let totalTxnsConfirmed = 0;
  let totalTxnsFailed = 0;

  // Build recipient lists from input file
  const mobileRecipients: SubscriberRecipient[] = [];
  const hntRecipients: SubscriberRecipient[] = [];

  for (const entry of entries) {
    if (entry.mobileRecipientKey && entry.mobileRecipientKey !== "") {
      mobileRecipients.push({
        address: new PublicKey(entry.mobileRecipientKey),
        assetId: entry.asset,
        entityKey: entry.encodedEntityKey,
        lazyDistributor: mobileLazyDistributor,
      });
    }
    if (entry.hntRecipientKey && entry.hntRecipientKey !== "") {
      hntRecipients.push({
        address: new PublicKey(entry.hntRecipientKey),
        assetId: entry.asset,
        entityKey: entry.encodedEntityKey,
        lazyDistributor: hntLazyDistributor,
      });
    }
  }

  console.log(
    `Found ${mobileRecipients.length.toLocaleString()} MOBILE recipients`
  );
  console.log(
    `Found ${hntRecipients.length.toLocaleString()} HNT recipients\n`
  );

  async function processAndSendBatch(
    subscriberRecipients: SubscriberRecipient[],
    batchNum: number,
    distributorType: "MOBILE" | "HNT"
  ): Promise<void> {
    const prefix = `[${distributorType} ${batchNum}]`;
    totalRecipientsProcessed += subscriberRecipients.length;

    if (subscriberRecipients.length === 0) {
      return;
    }

    console.log(
      `${prefix} Processing ${subscriberRecipients.length.toLocaleString()} recipients...`
    );

    // 1. Verify recipients still exist (skip already closed)
    const recipientAddresses = subscriberRecipients.map((r) => r.address);
    const verifyChunks = chunks(recipientAddresses, 100);
    const verifyLimiter = pLimit(10);
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
          } catch (err: unknown) {
            const message = err instanceof Error ? err.message : String(err);
            console.error(`${prefix} Error verifying recipients: ${message}`);
          }
        })
      )
    );

    const validRecipients = subscriberRecipients.filter((r) =>
      existingRecipients.has(r.address.toBase58())
    );
    const alreadyClosed = subscriberRecipients.length - validRecipients.length;
    totalAlreadyClosed += alreadyClosed;

    if (validRecipients.length === 0) {
      console.log(`${prefix} All ${alreadyClosed} already closed`);
      return;
    }

    // 2. Verify keyToAsset accounts are closed
    const keyToAssetAddresses = validRecipients.map((r) => {
      return keyToAssetKey(dao, r.entityKey, "b58")[0];
    });

    const keyToAssetChunks = chunks(keyToAssetAddresses, 100);
    const keyToAssetLimiter = pLimit(10);
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
          } catch (err: unknown) {
            const message = err instanceof Error ? err.message : String(err);
            console.error(`${prefix} Error verifying keyToAsset: ${message}`);
          }
        })
      )
    );

    const recipientsReady = validRecipients.filter(
      (r, idx) => !existingKeyToAssets.has(keyToAssetAddresses[idx].toBase58())
    );
    const keyToAssetOpen = validRecipients.length - recipientsReady.length;
    totalKeyToAssetOpen += keyToAssetOpen;

    if (recipientsReady.length === 0) {
      console.log(
        `${prefix} ${keyToAssetOpen} skipped (keyToAsset not closed)`
      );
      return;
    }

    // 3. Build instructions
    const recipientChunks = chunks(recipientsReady, 50);
    const instructionLimiter = pLimit(10);
    let failedCount = 0;

    const allInstructions = await Promise.all(
      recipientChunks.map((chunk) =>
        instructionLimiter(async () => {
          const results = await Promise.all(
            chunk.map(async (recipient) => {
              try {
                const entityKeyBytes = Buffer.from(
                  bs58.decode(recipient.entityKey)
                );
                const keyToAsset = keyToAssetKey(
                  dao,
                  recipient.entityKey,
                  "b58"
                )[0];

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
                  })
                  .instruction();
              } catch {
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
      console.log(`${prefix} No valid instructions`);
      return;
    }

    // 4. Batch into transactions
    const txns = await batchInstructionsToTxsWithPriorityFee(
      provider,
      instructions,
      {
        useFirstEstimateForAll: true,
        computeUnitLimit: 600000,
      }
    );

    if (!argv.commit) {
      console.log(
        `${prefix} ${recipientsReady.length} ready, ${txns.length} txns [dry run]`
      );
      return;
    }

    // 5. Sign and send transactions
    const recentBlockhash = await sendConnection.getLatestBlockhash(
      "confirmed"
    );

    const signedTxns = await Promise.all(
      txns.map(async (draft) => {
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

      totalTxnsConfirmed += confirmedTxs.length;
      console.log(
        `${prefix} ✓ ${confirmedTxs.length}/${txns.length} txns confirmed`
      );
    } catch (err: unknown) {
      totalTxnsFailed += txns.length;
      const message = err instanceof Error ? err.message : String(err);
      console.error(`${prefix} Send error: ${message}`);
    }
  }

  // Process MOBILE and HNT recipients in parallel batches
  const PARALLEL_BATCHES = 5;
  const batchLimiter = pLimit(PARALLEL_BATCHES);

  const mobileBatches = chunks(mobileRecipients, BATCH_SIZE);
  const hntBatches = chunks(hntRecipients, BATCH_SIZE);

  console.log(
    `\n=== Processing ${mobileBatches.length} MOBILE + ${hntBatches.length} HNT batches (${PARALLEL_BATCHES} parallel) ===\n`
  );

  const allBatchTasks = [
    ...mobileBatches.map((batch, idx) =>
      batchLimiter(() => processAndSendBatch(batch, idx + 1, "MOBILE"))
    ),
    ...hntBatches.map((batch, idx) =>
      batchLimiter(() => processAndSendBatch(batch, idx + 1, "HNT"))
    ),
  ];

  await Promise.all(allBatchTasks);

  // Final summary
  console.log(`\n========================================`);
  console.log(`           FINAL SUMMARY`);
  console.log(`========================================`);
  console.log(
    `Total recipients processed:  ${totalRecipientsProcessed.toLocaleString()}`
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
    console.log(`\nDry run complete. Re-run with --commit to execute`);
  } else {
    console.log(
      `Transactions confirmed:      ${totalTxnsConfirmed.toLocaleString()}`
    );
    if (totalTxnsFailed > 0) {
      console.log(
        `  Failed:                    ${totalTxnsFailed.toLocaleString()}`
      );
    }
    console.log(`\n✓ Complete`);
  }
}
