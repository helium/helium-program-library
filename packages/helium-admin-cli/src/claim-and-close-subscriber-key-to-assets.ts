import * as anchor from "@coral-xyz/anchor";
import * as client from "@helium/distributor-oracle";
import {
  init as initHem,
  entityCreatorKey,
  keyToAssetForAsset,
  rewardableEntityConfigKey,
  iotInfoKey,
  mobileInfoKey,
} from "@helium/helium-entity-manager-sdk";
import { daoKey, subDaoKey } from "@helium/helium-sub-daos-sdk";
import {
  init as initLazy,
  lazyDistributorKey,
  recipientKey,
} from "@helium/lazy-distributor-sdk";
import { init as initRewards } from "@helium/rewards-oracle-sdk";
import {
  HNT_MINT,
  MOBILE_MINT,
  IOT_MINT,
  searchAssets,
  batchInstructionsToTxsWithPriorityFee,
  bulkSendTransactions,
  bulkSendRawTransactions,
  chunks,
  truthy,
} from "@helium/spl-utils";
import { PublicKey, TransactionInstruction } from "@solana/web3.js";
import BN from "bn.js";
import os from "os";
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
  const lazyDistributor = lazyDistributorKey(MOBILE_MINT)[0];
  const entityCreator = entityCreatorKey(dao)[0];

  console.log("Finding all subscriber assets...");

  // Find all subscriber assets using DAS
  let page = 1;
  const limit = 1000;
  let allSubscriberAssets: any[] = [];

  while (true) {
    const assets = await searchAssets(provider.connection.rpcEndpoint, {
      creatorVerified: true,
      creatorAddress: entityCreator.toBase58(),
      page,
      limit,
    });

    const subscribers = assets.filter(
      (asset) => asset?.content?.metadata?.symbol === "SUBSCRIBER"
    );

    allSubscriberAssets = allSubscriberAssets.concat(subscribers);

    if (assets.length < limit) {
      break;
    }
    page++;
  }

  console.log(`Found ${allSubscriberAssets.length} subscriber assets\n`);

  // ========== STEP 1: Claim all rewards until none remain ==========
  console.log("=== STEP 1: CLAIMING ALL REWARDS ===\n");

  let claimIteration = 0;
  let totalClaimedAmount = new BN(0);
  let totalClaimedTransactions = 0;

  while (true) {
    claimIteration++;
    console.log(`\n--- Claim Iteration ${claimIteration} ---`);

    // Check pending rewards for each
    let assetsWithRewards = 0;
    let assetsWithZeroRewards = 0;
    let totalPendingRewards = new BN(0);

    const assetsToClaim: { asset: PublicKey; rewards: client.Reward[] }[] = [];
    const existingRecipients = new Set<string>();
    const recipientKeys = allSubscriberAssets.map(
      (asset) => recipientKey(lazyDistributor, asset.id)[0]
    );

    // Fetch recipients in parallel batches
    const recipientKeyChunks = chunks(recipientKeys, 100);
    for (const batch of chunks(recipientKeyChunks, 10)) {
      await Promise.all(
        batch.map(async (chunk) => {
          const accountInfos =
            await lazyProgram.account.recipientV0.fetchMultiple(chunk);
          accountInfos.forEach((info, index) => {
            if (info) {
              existingRecipients.add(chunk[index].toBase58());
            }
          });
        })
      );
    }

    // Check rewards for each asset
    for (const chunk of chunks(allSubscriberAssets, 100)) {
      await Promise.all(
        chunk.map(async (asset) => {
          const assetId = asset.id;
          const [recipientAddr] = recipientKey(lazyDistributor, assetId);

          if (!existingRecipients.has(recipientAddr.toBase58())) {
            assetsWithZeroRewards++;
            return;
          }

          try {
            const rewards = await client.getCurrentRewards(
              lazyProgram,
              lazyDistributor,
              assetId
            );

            const totalRewards = rewards.reduce((sum, r) => {
              return sum.add(new BN(r.currentRewards));
            }, new BN(0));

            if (totalRewards.gt(new BN(0))) {
              assetsWithRewards++;
              totalPendingRewards = totalPendingRewards.add(totalRewards);
              assetsToClaim.push({ asset: assetId, rewards });
            } else {
              assetsWithZeroRewards++;
            }
          } catch (err: any) {
            // Skip assets that error (e.g., no recipient)
            assetsWithZeroRewards++;
          }
        })
      );

      console.log(
        `Checked ${assetsWithRewards + assetsWithZeroRewards} / ${
          allSubscriberAssets.length
        } assets...`
      );
    }

    console.log(`Assets with pending rewards: ${assetsWithRewards}`);
    console.log(`Assets with zero pending rewards: ${assetsWithZeroRewards}`);
    console.log(
      `Total pending rewards: ${totalPendingRewards.toString()} (${totalPendingRewards
        .div(new BN(100000000))
        .toString()} MOBILE)`
    );

    // If no more rewards, break out of loop
    if (assetsWithRewards === 0) {
      console.log("\n✓ All rewards have been claimed!");
      break;
    }

    if (!argv.commit) {
      console.log(
        `\nDry run: would claim rewards for ${assetsWithRewards} assets in iteration ${claimIteration}.`
      );
      console.log(
        `Note: In commit mode, script will loop until all rewards are claimed.`
      );
      // Continue to step 2 in dry-run to show what would be closed
      break;
    }

    console.log(`\nClaiming rewards for ${assetsWithRewards} assets...`);

    // Batch claim rewards
    const txns: anchor.web3.VersionedTransaction[] = [];

    for (const chunk of chunks(assetsToClaim, 20)) {
      const batchTxns = await Promise.all(
        chunk.map(async ({ asset, rewards }) => {
          try {
            return await client.formTransaction({
              program: lazyProgram,
              rewardsOracleProgram: rewardsOracleProgram,
              provider,
              rewards,
              asset,
              lazyDistributor,
              wallet: authority.publicKey,
            });
          } catch (err: any) {
            console.error(
              `Error forming transaction for asset ${asset.toBase58()}: ${
                err.message
              }`
            );
            return null;
          }
        })
      );

      txns.push(...batchTxns.filter(truthy));
      console.log(
        `Prepared ${txns.length}/${assetsToClaim.length} claim transactions...`
      );
    }

    console.log(`Sending ${txns.length} transactions...`);

    for (const tx of txns) {
      tx.sign([authority]);
    }

    await bulkSendRawTransactions(
      provider.connection,
      txns.map((tx) => Buffer.from(tx.serialize())),
      (status) => {
        console.log(
          `Sending ${status.currentBatchProgress} / ${status.currentBatchSize} in batch. ${status.totalProgress} / ${txns.length}`
        );
      }
    );

    totalClaimedAmount = totalClaimedAmount.add(totalPendingRewards);
    totalClaimedTransactions += txns.length;

    console.log(
      `Iteration ${claimIteration} complete. Claimed ${totalPendingRewards
        .div(new BN(100000000))
        .toString()} MOBILE across ${txns.length} transactions.`
    );

    // Wait a bit before next iteration to let chain settle
    console.log("\nWaiting 5 seconds before next check...");
    await new Promise((resolve) => setTimeout(resolve, 5000));
  }

  console.log(`\n=== CLAIM SUMMARY ===`);
  console.log(`Total iterations: ${claimIteration}`);
  console.log(
    `Total claimed: ${totalClaimedAmount
      .div(new BN(100000000))
      .toString()} MOBILE`
  );
  console.log(`Total transactions: ${totalClaimedTransactions}`);

  // ========== STEP 2: Close all KeyToAssetV0 accounts ==========
  console.log("\n\n=== STEP 2: CLOSING KEYTOASSETV0 ACCOUNTS ===\n");

  // Check which KeyToAssetV0 accounts exist
  const keyToAssetInfos: {
    keyToAsset: PublicKey;
    assetId: PublicKey;
    recipient: PublicKey;
  }[] = [];
  for (const asset of allSubscriberAssets) {
    const keyToAssetAddr = keyToAssetForAsset(asset, dao);
    const recipient = recipientKey(lazyDistributor, asset.id)[0];
    keyToAssetInfos.push({
      keyToAsset: keyToAssetAddr,
      assetId: asset.id,
      recipient,
    });
  }

  console.log("Checking which KeyToAssetV0 accounts exist on-chain...");

  const existingKeyToAssets: typeof keyToAssetInfos = [];
  const keyToAssetChunks = chunks(keyToAssetInfos, 100);

  for (const batch of chunks(keyToAssetChunks, 10)) {
    await Promise.all(
      batch.map(async (chunk) => {
        const infos = await hemProgram.account.keyToAssetV0.fetchMultiple(
          chunk.map((c) => c.keyToAsset)
        );
        infos.forEach((info, idx) => {
          if (info) {
            existingKeyToAssets.push(chunk[idx]);
          }
        });
      })
    );
  }

  console.log(
    `${existingKeyToAssets.length} KeyToAssetV0 accounts exist on-chain`
  );

  if (existingKeyToAssets.length === 0) {
    console.log("\n✓ No KeyToAssetV0 accounts to close.");
    console.log("\n=== ALL DONE ===");
    return;
  }

  if (!argv.commit) {
    console.log(
      `\nDry run: would close ${existingKeyToAssets.length} KeyToAssetV0 accounts.`
    );
    console.log(
      `\nRe-run with --commit to claim all rewards and close KeyToAssetV0 accounts.`
    );
    console.log(
      `After this completes, run close-all-subscriber-recipients to close RecipientV0 accounts.`
    );
    return;
  }

  console.log(
    `\nClosing ${existingKeyToAssets.length} KeyToAssetV0 accounts...`
  );

  // Build close instructions
  const instructions: TransactionInstruction[] = [];

  for (const chunk of chunks(existingKeyToAssets, 20)) {
    const batchInstructions = await Promise.all(
      chunk.map(async ({ keyToAsset, assetId }) => {
        const keyToAssetAcc = await hemProgram.account.keyToAssetV0.fetch(
          keyToAsset
        );
        const [mobileInfo] = await mobileInfoKey(
          mobileConfig,
          keyToAssetAcc.entityKey
        );
        const [iotInfo] = await iotInfoKey(iotConfig, keyToAssetAcc.entityKey);
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
          })
          .instruction();
      })
    );

    instructions.push(...batchInstructions);
    console.log(
      `Prepared ${instructions.length}/${existingKeyToAssets.length} close instructions...`
    );
  }

  console.log(
    `\nBatching ${instructions.length} instructions into transactions...`
  );

  const closeTxns = await batchInstructionsToTxsWithPriorityFee(
    provider,
    instructions,
    {
      useFirstEstimateForAll: true,
      computeUnitLimit: 600000,
    }
  );

  console.log(`\nSending ${closeTxns.length} transactions...`);

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
    `\n✓ Closed ${existingKeyToAssets.length} KeyToAssetV0 accounts.`
  );

  console.log("\n=== ALL DONE ===");
  console.log(
    `Claimed ${totalClaimedAmount
      .div(new BN(100000000))
      .toString()} MOBILE across ${totalClaimedTransactions} transactions`
  );
  console.log(`Closed ${existingKeyToAssets.length} KeyToAssetV0 accounts`);
  console.log(
    `\nNext step: Run close-all-subscriber-recipients to close RecipientV0 accounts.`
  );
}
