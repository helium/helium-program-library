import * as anchor from "@coral-xyz/anchor";
import {
  keyToAssetForAsset,
  init as initHem,
} from "@helium/helium-entity-manager-sdk";
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
import { PublicKey, TransactionInstruction } from "@solana/web3.js";
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
    ownerWallet: {
      type: "string",
      describe: "Public key of wallet owner to check for hotspots",
      required: false,
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
      default: PublicKey.default,
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
  const hemProgram = await initHem(provider);
  const ownerWallet = argv.ownerWallet
    ? new PublicKey(argv.ownerWallet)
    : new PublicKey(argv.wallet);
  const destination = new PublicKey(argv.destination);
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

  console.log(`Found ${assets.length} hotspots`);
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

  const recipients = (
    await Promise.all(
      assets.map(async (asset) => {
        const keyToAsset = keyToAssetForAsset(asset);
        const ktaAcc = await hemProgram.account.keyToAssetV0.fetch(keyToAsset);
        const assetKey = ktaAcc.asset;
        const checkResults = await Promise.all(
          mintsToUpdate.map(async (mint, i) => {
            const lazyKey = lazyDistributorKey(mint)[0];
            const mintName = mint.equals(IOT_MINT)
              ? "iot"
              : mint.equals(MOBILE_MINT)
              ? "mobile"
              : "hnt";
            const recipient = recipientKey(lazyKey, assetKey)[0];
            const doesExist = await exists(provider, recipient);

            if (doesExist) {
              return { mintName, recipient, assetKey };
            }
            return null;
          })
        );

        return checkResults.filter(
          (
            result
          ): result is {
            mintName: string;
            recipient: PublicKey;
            assetKey: PublicKey;
          } => !!result
        );
      })
    )
  ).flat();

  /*   for (const { mintName, recipient, assetKey } of recipients) {
    console.log("WTF 1");
    if (!recipientsToUpdate[mintName]) {
      recipientsToUpdate[mintName] = [];
    }

    const recipientAcc = await lazyProgram.account.recipientV0.fetch(recipient);

    console.log("WTF 2 ");
    if (recipientAcc.destination.toBase58() !== destination.toBase58()) {
      console.log("WTF 3");
      recipientsToUpdate[mintName].push({ recipient, asset: assetKey });
    }
  } */

  for (const [mintName, recipients] of Object.entries(recipientsToUpdate)) {
    if (argv.commit) {
      try {
        const instructions: TransactionInstruction[] = [];
        for (const { recipient, asset } of recipients) {
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

          instructions.push(
            await lazyProgram.methods
              .updateCompressionDestinationV0({
                ...args,
              })
              .accounts({
                ...accounts,
                owner,
                recipient,
                destination:
                  destination == null ? PublicKey.default : destination,
              })
              .remainingAccounts(remainingAccounts)
              .instruction()
          );
        }

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
        `Would update ${
          recipients.length
        } recipients for ${mintName.toUpperCase()} to destination ${destination.toBase58()}`
      );
    }

    console.log(`Finished processing ${mintName.toUpperCase()} recipients`);
  }

  if (!argv.commit) {
    console.log("\nSummary:");
    for (const [mintName, recipients] of Object.entries(recipientsToUpdate)) {
      console.log(
        `- ${mintName.toUpperCase()}: ${recipients.length} recipients`
      );
    }
    console.log(
      "\nDry run completed. Use --commit flag to execute the updates."
    );
  } else {
    console.log("\nUpdates committed to chain.");
  }
}
