import * as anchor from "@coral-xyz/anchor";
import { keyToAssetForAsset } from "@helium/helium-entity-manager-sdk";
import { daoKey } from "@helium/helium-sub-daos-sdk";
import {
  init as initLazy,
  lazyDistributorKey,
} from "@helium/lazy-distributor-sdk";
import { init as initRewards } from "@helium/rewards-oracle-sdk";
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

  const authority = argv.authority
    ? loadKeypair(argv.authority as string)
    : loadKeypair(argv.wallet as string);
  const approver = argv.approver ? loadKeypair(argv.approver as string) : null;

  const dao = daoKey(HNT_MINT)[0];
  const lazyDistributor = lazyDistributorKey(MOBILE_MINT)[0];

  console.log(
    "Getting all RecipientV0 accounts for MOBILE lazy distributor..."
  );

  const allRecipients = await lazyProgram.account.recipientV0.all([
    {
      memcmp: {
        offset: 8, // After discriminator
        bytes: lazyDistributor.toBase58(),
      },
    },
  ]);

  console.log(`Found ${allRecipients.length} total RecipientV0 accounts`);

  // Decode recipients and get their assets
  const recipientsWithAssets: {
    address: PublicKey;
    asset: PublicKey;
    recipientData: any;
  }[] = [];

  for (const { publicKey: pubkey, account: recipient } of allRecipients) {
    try {
      recipientsWithAssets.push({
        address: pubkey,
        asset: recipient.asset,
        recipientData: recipient,
      });
    } catch (err) {
      console.error(`Error decoding recipient ${pubkey.toBase58()}: ${err}`);
    }
  }

  console.log("Checking which recipients are for subscriber assets...");

  const assetIds = recipientsWithAssets.map((r) => r.asset);
  const assets = (
    await Promise.all(
      chunks(assetIds, 1000).map(async (chunk) => {
        const result = await getAssetBatch(
          provider.connection.rpcEndpoint,
          chunk
        );
        return result || [];
      })
    )
  ).flat();

  const subscriberRecipients: {
    address: PublicKey;
    asset: any;
    recipientData: any;
  }[] = [];

  if (!assets) {
    console.error("Failed to fetch assets");
    process.exit(1);
  }

  for (let i = 0; i < assets.length; i++) {
    const asset = assets[i];
    if (asset && asset.content?.metadata?.symbol === "SUBSCRIBER") {
      subscriberRecipients.push({
        address: recipientsWithAssets[i].address,
        asset,
        recipientData: recipientsWithAssets[i].recipientData,
      });
    }
  }

  console.log("\n=== Summary ===");
  console.log(`Found ${allRecipients.length} total RecipientV0 accounts`);
  console.log(`${subscriberRecipients.length} are for subscriber assets`);

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

  console.log(`\nClosing ${subscriberRecipients.length} recipient accounts...`);

  // Build close instructions
  const instructions: TransactionInstruction[] = [];
  let failedCount = 0;

  for (const chunk of chunks(subscriberRecipients, 20)) {
    const batchResults = await Promise.all(
      chunk.map(async (recipient) => {
        const { address: recipientAddr, asset } = recipient;
        try {
          // Compute the KeyToAssetV0 address (should be closed already)
          const keyToAsset = keyToAssetForAsset(asset, dao);

          // Get the entity key from the asset (it's the last part of the json_uri)
          const entityKeyStr = asset.content.json_uri
            .split("/")
            .slice(-1)[0] as string;
          const entityKeyBytes = Buffer.from(bs58.decode(entityKeyStr));

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

    const validInstructions = batchResults.filter(
      (i): i is TransactionInstruction => i !== null
    );

    instructions.push(...validInstructions);
    failedCount += chunk.length - validInstructions.length;

    console.log(
      `Prepared ${instructions.length}/${subscriberRecipients.length} close instructions...`
    );
  }

  console.log(
    `\nBatching ${instructions.length} instructions into transactions...`
  );

  const txns = await batchInstructionsToTxsWithPriorityFee(
    provider,
    instructions,
    {
      useFirstEstimateForAll: true,
      computeUnitLimit: 600000,
    }
  );

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
    `\nDone. Closed ${subscriberRecipients.length} recipient accounts${
      failedCount > 0 ? ` (${failedCount} failed to build instructions)` : ""
    }.`
  );
}
