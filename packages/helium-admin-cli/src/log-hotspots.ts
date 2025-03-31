import * as anchor from "@coral-xyz/anchor";
import {
  decodeEntityKey,
  init as initHem,
  keyToAssetForAsset,
} from "@helium/helium-entity-manager-sdk";
import {
  lazyDistributorKey,
  recipientKey,
  init as initLazy,
} from "@helium/lazy-distributor-sdk";
import { Asset, HNT_MINT, searchAssetsWithPageInfo } from "@helium/spl-utils";
import { PublicKey } from "@solana/web3.js";
import os from "os";
import yargs from "yargs/yargs";

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
    ownerWallet: {
      type: "string",
      describe: "Public key of wallet owner to check for hotspots",
      required: true,
    },
    logType: {
      type: "string",
      describe:
        "Type of log: 'hotspots', 'recipients', or 'recipientDestinations'",
      default: "hotspots",
      choices: ["hotspots", "recipients", "recipientDestinations"],
    },
    batchSize: {
      type: "number",
      describe: "Number of concurrent requests to process",
      default: 10,
    },
  });

  const argv = await yarg.argv;
  process.env.ANCHOR_WALLET = argv.wallet;
  process.env.ANCHOR_PROVIDER_URL = argv.url;
  anchor.setProvider(anchor.AnchorProvider.local(argv.url));

  const provider = anchor.getProvider() as anchor.AnchorProvider;
  const hemProgram = await initHem(provider);
  const lazyProgram = await initLazy(provider);

  // Parse and set the wallet address
  const ownerWallet = new PublicKey(argv.ownerWallet);
  console.log(`Searching for hotspots owned by: ${ownerWallet.toBase58()}`);

  // Get the compressed assets with pagination
  const PAGE_LIMIT = 1000;
  const batchSize = argv.batchSize || 10;

  let firstPageResult = await getCompressedCollectablesByOwner(
    ownerWallet,
    provider,
    1,
    PAGE_LIMIT
  );

  let totalPages = Math.ceil(firstPageResult.total / PAGE_LIMIT);
  let assets: Asset[] = [...firstPageResult.items];

  // Fetch remaining pages in parallel with controlled concurrency
  if (totalPages > 1) {
    // Create array of page numbers to fetch
    const remainingPages = Array.from(
      { length: totalPages - 1 },
      (_, i) => i + 2
    );

    // Process pages in batches to control concurrency
    for (let i = 0; i < remainingPages.length; i += batchSize) {
      const pagesBatch = remainingPages.slice(i, i + batchSize);
      const pageResults = await Promise.all(
        pagesBatch.map((page) =>
          getCompressedCollectablesByOwner(
            ownerWallet,
            provider,
            page,
            PAGE_LIMIT
          )
        )
      );

      // Concatenate results
      pageResults.forEach((result) => {
        assets = assets.concat(result.items);
      });
    }
  }

  if (assets.length === 0) {
    console.log("No hotspots found for this wallet");
    return;
  }

  console.log(`Found ${assets.length} hotspots`);

  // Define lazy distributor for HNT recipient lookups
  const hntLazy = lazyDistributorKey(HNT_MINT)[0];

  // If logType is recipients or recipientDestinations, we'll track counts for summary
  const recipientCounts = {
    hnt: {} as Record<string, number>,
  };

  // For recipientDestinations, track by destination
  const recipientDestinations = {
    hnt: {} as Record<string, { count: number; assets: string[] }>,
  };

  PublicKey.prototype.toString = PublicKey.prototype.toBase58;

  // Pre-calculate all recipient keys and keyToAsset keys
  const assetData = assets.map((asset) => {
    const assetId = new PublicKey(asset.id);
    const keyToAssetK = keyToAssetForAsset(asset);
    const hntRecipientKey = recipientKey(hntLazy, assetId)[0];

    return {
      asset,
      assetId,
      keyToAssetK,
      hntRecipientKey,
    };
  });

  // Process assets in batches
  for (let i = 0; i < assetData.length; i += batchSize) {
    const batch = assetData.slice(i, i + batchSize);

    // Fetch keyToAsset data in parallel
    const keyToAssetPromises = batch.map((data) =>
      hemProgram.account.keyToAssetV0.fetch(data.keyToAssetK)
    );

    const keyToAssetResults = await Promise.all(keyToAssetPromises);

    // Process based on log type
    if (argv.logType === "hotspots") {
      batch.forEach((data, index) => {
        const keyToAsset = keyToAssetResults[index];
        const entityKey = decodeEntityKey(
          keyToAsset.entityKey,
          keyToAsset.keySerialization
        )!;
        console.log(data.asset);
      });
    } else if (
      argv.logType === "recipients" ||
      argv.logType === "recipientDestinations"
    ) {
      // Fetch recipient data in parallel if needed
      if (argv.logType === "recipients") {
        const recipientPromises = batch.map((data) =>
          lazyProgram.account.recipientV0.fetchNullable(data.hntRecipientKey)
        );
        const recipientResults = await Promise.all(recipientPromises);

        batch.forEach((data, index) => {
          const keyToAsset = keyToAssetResults[index];
          const hntRecipientKey = data.hntRecipientKey.toBase58();
          recipientCounts.hnt[hntRecipientKey] =
            (recipientCounts.hnt[hntRecipientKey] || 0) + 1;

          console.log("HNT Recipient:", hntRecipientKey);
          console.log("HNT Recipient Data:", recipientResults[index]);
        });
      } else if (argv.logType === "recipientDestinations") {
        const recipientPromises = batch.map((data) =>
          lazyProgram.account.recipientV0.fetchNullable(data.hntRecipientKey)
        );
        const recipientResults = await Promise.all(recipientPromises);

        batch.forEach((data, index) => {
          const hntRecipientData = recipientResults[index];
          const hntRecipientKey = data.hntRecipientKey.toBase58();

          recipientCounts.hnt[hntRecipientKey] =
            (recipientCounts.hnt[hntRecipientKey] || 0) + 1;

          if (hntRecipientData) {
            const destination = hntRecipientData.destination.toString();
            if (!recipientDestinations.hnt[destination]) {
              recipientDestinations.hnt[destination] = {
                count: 0,
                assets: [],
              };
            }
            recipientDestinations.hnt[destination].count += 1;
            recipientDestinations.hnt[destination].assets.push(
              data.assetId.toString()
            );
          }
        });
      }
    }
  }

  // Print summary of recipient counts if logType is recipients
  if (argv.logType === "recipients") {
    console.log("\n=======================================");
    console.log("RECIPIENT SUMMARY");
    console.log("=======================================");

    console.log("\nHNT Recipients:");
    console.log(recipientCounts.hnt);
  }

  // Print summary of recipient destinations if logType is recipientDestinations
  if (argv.logType === "recipientDestinations") {
    console.log("\n=======================================");
    console.log("RECIPIENT DESTINATIONS SUMMARY");
    console.log("=======================================");

    console.log("\nHNT Recipient Destinations:");
    console.log(JSON.stringify(recipientDestinations.hnt, null, 2));
  }
}

// Function to get compressed collectables by owner
async function getCompressedCollectablesByOwner(
  pubKey: PublicKey,
  anchorProvider: anchor.AnchorProvider,
  page?: number,
  limit?: number
) {
  // Get endpoint from provider
  const endpoint = anchorProvider.connection.rpcEndpoint;

  // Search for assets with pagination
  const { items, ...rest } = await searchAssetsWithPageInfo(endpoint, {
    ownerAddress: pubKey.toBase58(),
    page,
    limit,
    burnt: false,
    options: {
      showGrandTotal: true,
    },
  });

  return {
    ...rest,
    items,
  };
}
