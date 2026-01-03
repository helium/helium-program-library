import * as anchor from "@coral-xyz/anchor";
import {
  lazyDistributorKey,
  recipientKey,
  init as initLazy,
} from "@helium/lazy-distributor-sdk";
import {
  Asset,
  IOT_MINT,
  MOBILE_MINT,
  HNT_MINT,
  searchAssetsWithPageInfo,
  batchInstructionsToTxsWithPriorityFee,
  bulkSendTransactions,
  proofArgsAndAccounts,
} from "@helium/spl-utils";
import { PublicKey } from "@solana/web3.js";
import os from "os";
import yargs from "yargs/yargs";

export async function exists(
  provider: anchor.AnchorProvider,
  account: PublicKey
): Promise<boolean> {
  return Boolean(await provider.connection.getAccountInfo(account));
}

async function getCompressedCollectablesByOwner(
  provider: anchor.AnchorProvider,
  pubKey: PublicKey,
  page?: number,
  limit?: number
) {
  const endpoint = provider.connection.rpcEndpoint;
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
    mint: {
      type: "string",
      describe: "Token mint type to update recipients for",
      default: "all",
      choices: ["iot", "mobile", "hnt", "all"],
    },
    destination: {
      type: "string",
      describe: "Destination address to update recipients to",
      required: false,
    },
    commit: {
      type: "boolean",
      describe: "Commit transactions to the chain",
      default: false,
    },
  });

  const PAGE_LIMIT = 1000;
  const argv = await yarg.argv;
  process.env.ANCHOR_WALLET = argv.wallet;
  process.env.ANCHOR_PROVIDER_URL = argv.url;
  anchor.setProvider(anchor.AnchorProvider.local(argv.url));

  const provider = anchor.getProvider() as anchor.AnchorProvider;
  const lazyProgram = await initLazy(provider);
  const ownerWallet = provider.publicKey;
  const destination = argv.destination
    ? new PublicKey(argv.destination)
    : PublicKey.default;
  const destinationExists = await exists(provider, destination);
  if (!destinationExists) {
    console.log("Destination doesn't exist");
    process.exit(1);
  }
  console.log(`Searching for hotspots owned by: ${ownerWallet.toBase58()}`);
  console.log(`Destination address: ${destination.toBase58()}`);

  let firstPageResult = await getCompressedCollectablesByOwner(
    provider,
    ownerWallet,
    1,
    PAGE_LIMIT
  );

  let totalPages = Math.ceil(firstPageResult.total / PAGE_LIMIT);
  let assets: Asset[] = [...firstPageResult.items];
  if (assets.length === 0) {
    console.log("No hotspots found for this wallet");
    return;
  }

  if (totalPages > 1) {
    const remainingPages = Array.from(
      { length: totalPages - 1 },
      (_, i) => i + 2
    );

    const pageResults = await Promise.all(
      remainingPages.map((page) =>
        getCompressedCollectablesByOwner(
          provider,
          ownerWallet,
          page,
          PAGE_LIMIT
        )
      )
    );

    pageResults.forEach((result) => {
      assets = assets.concat(result.items);
    });
  }

  const mintMap = {
    iot: IOT_MINT,
    mobile: MOBILE_MINT,
    hnt: HNT_MINT,
  };

  const mintsToUpdate =
    argv.mint === "all"
      ? Object.values(mintMap)
      : [mintMap[argv.mint as keyof typeof mintMap]];

  const recipientsToUpdate: Record<
    string,
    { recipient: PublicKey; asset: PublicKey }[]
  > = {};

  mintsToUpdate.forEach((mint) => {
    const mintName = mint.equals(IOT_MINT)
      ? "iot"
      : mint.equals(MOBILE_MINT)
      ? "mobile"
      : "hnt";
    recipientsToUpdate[mintName] = [];
  });

  const recipientChecks = assets
    .flatMap((asset) =>
      mintsToUpdate.map((mint) => ({
        mint,
        assetId: asset.id,
        lazyKey: lazyDistributorKey(mint)[0],
        mintName: mint.equals(IOT_MINT)
          ? "iot"
          : mint.equals(MOBILE_MINT)
          ? "mobile"
          : "hnt",
      }))
    )
    .map(async ({ assetId, lazyKey, mintName }) => {
      const recipient = recipientKey(lazyKey, assetId)[0];
      const acc = await lazyProgram.account.recipientV0.fetchNullable(
        recipient
      );

      if (acc && acc.destination.toBase58() !== destination.toBase58()) {
        recipientsToUpdate[mintName].push({ recipient, asset: assetId });
      }
    });

  await Promise.all(recipientChecks);

  console.log("\nSummary:");
  for (const [mintName, recipients] of Object.entries(recipientsToUpdate)) {
    console.log(
      `- ${mintName.toUpperCase()}: ${
        recipients.length
      } recipients to destination ${destination.toBase58()}`
    );
  }

  if (argv.commit) {
    try {
      const instructions = await Promise.all(
        Object.values(recipientsToUpdate)
          .flat()
          .map(async ({ recipient, asset }) => {
            const {
              asset: {
                ownership: { owner },
              },
              args,
              accounts,
              remainingAccounts,
            } = await proofArgsAndAccounts({
              connection: provider.connection,
              assetId: asset,
            });

            return lazyProgram.methods
              .updateCompressionDestinationV0({
                ...args,
              })
              .accountsPartial({
                ...accounts,
                owner,
                recipient,
                destination:
                  destination == null ? PublicKey.default : destination,
              })
              .remainingAccounts(remainingAccounts)
              .instruction();
          })
      );

      const transactions = await batchInstructionsToTxsWithPriorityFee(
        provider,
        instructions,
        { useFirstEstimateForAll: true }
      );

      await bulkSendTransactions(
        provider,
        transactions,
        console.log,
        10,
        [],
        100
      );
    } catch (e) {
      console.log("Failed to update recipients", e);
      process.exit(1);
    }
  } else {
    console.log(
      "\nDry run completed. Use --commit flag to execute the updates."
    );
  }
}
