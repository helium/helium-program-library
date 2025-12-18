import * as anchor from "@coral-xyz/anchor";
import {
  init as initHem,
  keyToAssetKey,
} from "@helium/helium-entity-manager-sdk";
import { daoKey, subDaoKey } from "@helium/helium-sub-daos-sdk";
import { carrierKey, init as initMem } from "@helium/mobile-entity-manager-sdk";
import { HNT_MINT, MOBILE_MINT, getAsset } from "@helium/spl-utils";
import { PublicKey } from "@solana/web3.js";
import os from "os";
import yargs from "yargs/yargs";
import { loadKeypair } from "./utils";

// NFT types that need keyToAsset recreated
const NFT_TYPES = ["CARRIER", "SERVREWARD", "MAPREWARD"] as const;
type NftType = (typeof NFT_TYPES)[number];

interface NftConfig {
  symbol: NftType;
  entityKey: Buffer;
  name: string;
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
    authority: {
      type: "string",
      describe: "Path to the authority keypair. Defaults to wallet.",
    },
    commit: {
      type: "boolean",
      default: false,
      describe: "Actually execute transactions (default is dry run)",
    },
  });

  const argv = await yarg.argv;
  process.env.ANCHOR_WALLET = argv.wallet;
  process.env.ANCHOR_PROVIDER_URL = argv.url;
  anchor.setProvider(anchor.AnchorProvider.local(argv.url));
  const provider = anchor.getProvider() as anchor.AnchorProvider;

  const hemProgram = await initHem(provider);
  const memProgram = await initMem(provider);

  const dao = daoKey(HNT_MINT)[0];
  const subDao = subDaoKey(MOBILE_MINT)[0];
  const carrierName = "Helium Mobile";

  // Load authority keypair (defaults to wallet)
  const authority = argv.authority
    ? loadKeypair(argv.authority as string)
    : loadKeypair(argv.wallet as string);

  console.log(`Authority: ${authority.publicKey.toBase58()}`);
  if (
    authority.publicKey.toBase58() !==
    "hrp7GncEa2fJbweaGU5vkbZGwsoNQieahETrXcyrbTY"
  ) {
    console.error(
      "Error: Authority must be hrp7GncEa2fJbweaGU5vkbZGwsoNQieahETrXcyrbTY"
    );
    return;
  }

  // Verify carrier exists
  const [carrierAddr] = carrierKey(subDao, carrierName);
  const carrier = await memProgram.account.carrierV0.fetchNullable(carrierAddr);
  if (!carrier) {
    console.error(`Carrier '${carrierName}' not found`);
    return;
  }

  console.log(`Found carrier: ${carrierName}`);
  console.log(`  Collection: ${carrier.collection.toBase58()}`);

  // Define the three NFT types and their entity keys
  const nftConfigs: NftConfig[] = [
    {
      symbol: "CARRIER",
      entityKey: Buffer.from(carrierName, "utf8"),
      name: `${carrierName} Carrier NFT`,
    },
    {
      symbol: "SERVREWARD",
      entityKey: Buffer.from("Helium Mobile Service Rewards", "utf8"),
      name: "Helium Mobile Service Rewards",
    },
    {
      symbol: "MAPREWARD",
      entityKey: Buffer.from("Helium Mobile Mapping Rewards", "utf8"),
      name: "Helium Mobile Mapping Rewards",
    },
  ];

  console.log("\n=== Checking keyToAsset accounts ===\n");

  for (const config of nftConfigs) {
    const [keyToAssetAddr] = keyToAssetKey(dao, config.entityKey, "utf8");

    console.log(`${config.symbol} (${config.name}):`);
    console.log(`  Entity key: "${config.entityKey.toString("utf8")}"`);
    console.log(`  KeyToAsset PDA: ${keyToAssetAddr.toBase58()}`);

    // Check if keyToAsset exists
    const existingKeyToAsset =
      await hemProgram.account.keyToAssetV0.fetchNullable(keyToAssetAddr);

    if (existingKeyToAsset) {
      console.log(
        `  Status: ✓ EXISTS (asset: ${existingKeyToAsset.asset.toBase58()})`
      );
      continue;
    }

    console.log(`  Status: ✗ MISSING - needs recreation`);

    // Find the asset in DAS by searching the carrier's collection
    console.log(`  Searching for ${config.symbol} asset in collection...`);

    let assetId: PublicKey | null = null;

    // For CARRIER, the asset ID can be derived from the keyToAsset creators pattern
    // We need to search DAS for assets with this symbol in the carrier's collection
    try {
      // Use getAssetsByGroup to find assets in the collection
      const response = await fetch(provider.connection.rpcEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: "1",
          method: "getAssetsByGroup",
          params: {
            groupKey: "collection",
            groupValue: carrier.collection.toBase58(),
            page: 1,
            limit: 1000,
          },
        }),
      });

      const data = await response.json();
      if (data.result?.items) {
        for (const asset of data.result.items) {
          const symbol = asset.content?.metadata?.symbol;
          if (symbol === config.symbol) {
            assetId = new PublicKey(asset.id);
            console.log(`  Found asset: ${assetId.toBase58()}`);
            break;
          }
        }
      }
    } catch (err: any) {
      console.error(`  Error searching DAS: ${err.message}`);
    }

    if (!assetId) {
      console.log(`  ⚠️  Could not find ${config.symbol} asset in collection`);
      console.log(`     You may need to provide the asset ID manually`);
      continue;
    }

    if (!argv.commit) {
      console.log(
        `  Would recreate keyToAsset with asset: ${assetId.toBase58()}`
      );
      continue;
    }

    // Recreate the keyToAsset
    console.log(`  Recreating keyToAsset...`);

    try {
      const tx = await hemProgram.methods
        .tempRecreateKeyToAssetV0({
          entityKey: Array.from(config.entityKey),
          keySerialization: { utf8: {} },
          asset: assetId,
        })
        .accounts({
          payer: provider.wallet.publicKey,
          authority: authority.publicKey,
          dao,
        })
        .signers([authority])
        .rpc({ skipPreflight: true });

      console.log(`  ✓ Created keyToAsset: ${tx}`);
    } catch (err: any) {
      console.error(`  ✗ Failed to create keyToAsset: ${err.message}`);
    }
  }

  console.log("\n=== Summary ===");
  if (!argv.commit) {
    console.log("Dry run complete. Re-run with --commit to execute.");
  } else {
    console.log("Done! 🎉");
  }
}
