import * as anchor from "@coral-xyz/anchor";
import * as client from "@helium/distributor-oracle";
import {
  init as initHem,
  entityCreatorKey,
  keyToAssetForAsset,
} from "@helium/helium-entity-manager-sdk";
import { daoKey } from "@helium/helium-sub-daos-sdk";
import {
  init as initLazy,
  lazyDistributorKey,
  recipientKey,
} from "@helium/lazy-distributor-sdk";
import { init as initRewards } from "@helium/rewards-oracle-sdk";
import {
  HNT_MINT,
  MOBILE_MINT,
  searchAssets,
  batchInstructionsToTxsWithPriorityFee,
  bulkSendTransactions,
  bulkSendRawTransactions,
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
      describe:
        "Path to the authority keypair (hprdnjkbziK8NqhThmAn5Gu4XqrBbctX8du4PfJdgvW). Defaults to wallet.",
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

  // Verify authority is the expected pubkey
  const expectedAuthority = new PublicKey(
    "hprdnjkbziK8NqhThmAn5Gu4XqrBbctX8du4PfJdgvW"
  );
  if (!authority.publicKey.equals(expectedAuthority)) {
    console.error(
      `Authority keypair ${authority.publicKey.toBase58()} does not match expected ${expectedAuthority.toBase58()}`
    );
    process.exit(1);
  }

  const dao = daoKey(HNT_MINT)[0];
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
      ownerAddress: "", // Not filtering by owner, filtering by creator
    } as any);

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

    for (let i = 0; i < allSubscriberAssets.length; i++) {
      if (i > 0 && i % 100 === 0) {
        console.log(`Checked ${i}/${allSubscriberAssets.length} assets...`);
      }

      const asset = allSubscriberAssets[i];
      const assetId = asset.id;

      // Check if recipient exists
      const [recipientAddr] = recipientKey(lazyDistributor, assetId);
      const recipientInfo = await provider.connection.getAccountInfo(
        recipientAddr
      );

      if (!recipientInfo) {
        assetsWithZeroRewards++;
        continue;
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
    for (let i = 0; i < assetsToClaim.length; i++) {
      if (i > 0 && i % 100 === 0) {
        console.log(
          `Prepared ${i}/${assetsToClaim.length} claim transactions...`
        );
      }

      const { asset, rewards } = assetsToClaim[i];

      try {
        const tx = await client.formTransaction({
          program: lazyProgram,
          rewardsOracleProgram: rewardsOracleProgram,
          provider,
          rewards,
          asset,
          lazyDistributor,
        });

        txns.push(tx);
      } catch (err: any) {
        console.error(
          `Error forming transaction for asset ${asset.toBase58()}: ${
            err.message
          }`
        );
      }
    }

    console.log(`Sending ${txns.length} transactions...`);

    // Sign all transactions (already partially signed by oracle)
    const signedTxns = await Promise.all(
      txns.map((tx) => provider.wallet.signTransaction(tx))
    );

    // Send as raw transactions
    await bulkSendRawTransactions(
      provider.connection,
      signedTxns.map((tx) => Buffer.from(tx.serialize())),
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
  const keyToAssetAddresses: PublicKey[] = [];
  for (const asset of allSubscriberAssets) {
    const keyToAssetAddr = keyToAssetForAsset(asset, dao);
    keyToAssetAddresses.push(keyToAssetAddr);
  }

  console.log("Checking which KeyToAssetV0 accounts exist on-chain...");
  const accountInfos = await provider.connection.getMultipleAccountsInfo(
    keyToAssetAddresses
  );

  const existingKeyToAssets: PublicKey[] = [];
  for (let i = 0; i < accountInfos.length; i++) {
    if (accountInfos[i]) {
      existingKeyToAssets.push(keyToAssetAddresses[i]);
    }
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
  for (let i = 0; i < existingKeyToAssets.length; i++) {
    if (i > 0 && i % 100 === 0) {
      console.log(
        `Prepared ${i}/${existingKeyToAssets.length} close instructions...`
      );
    }

    const keyToAsset = existingKeyToAssets[i];

    instructions.push(
      await hemProgram.methods
        .tempCloseKeyToAssetV0()
        .accountsPartial({
          keyToAsset,
          rentReceiver: provider.wallet.publicKey,
        })
        .instruction()
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
