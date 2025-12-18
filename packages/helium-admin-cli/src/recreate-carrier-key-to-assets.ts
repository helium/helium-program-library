import * as anchor from "@coral-xyz/anchor";
import {
  init as initHem,
  keyToAssetKey,
} from "@helium/helium-entity-manager-sdk";
import { daoKey } from "@helium/helium-sub-daos-sdk";
import { HNT_MINT } from "@helium/spl-utils";
import { PublicKey } from "@solana/web3.js";
import os from "os";
import yargs from "yargs/yargs";
import { loadKeypair } from "./utils";

// NFT types that need keyToAsset recreated
interface NftConfig {
  symbol: string;
  entityKey: Buffer;
  name: string;
  asset: PublicKey;
}

const carrierName = "Helium Mobile";

// Hardcoded asset IDs from DB dump
const nftConfigs: NftConfig[] = [
  {
    symbol: "CARRIER",
    entityKey: Buffer.from(carrierName, "utf8"),
    name: `${carrierName} Carrier NFT`,
    asset: new PublicKey("EnKYuYZHWiBuME8jsgWqRFDzVoxeJNd7bKqhJZ38yj2D"),
  },
  {
    symbol: "SERVREWARD",
    entityKey: Buffer.from("Helium Mobile Service Rewards", "utf8"),
    name: "Helium Mobile Service Rewards",
    asset: new PublicKey("13F2pzaecZcKFfg2WdMAAnKVMmKZ1KvTQeo5jbiTmJeu"),
  },
  {
    symbol: "MAPREWARD",
    entityKey: Buffer.from("Helium Mobile Mapping Rewards", "utf8"),
    name: "Helium Mobile Mapping Rewards",
    asset: new PublicKey("HJtATvtga22LQPViQGoSdwqoHMS8uxirNNsRyGpQK1Nc"),
  },
];

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
  const dao = daoKey(HNT_MINT)[0];

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

  console.log(`DAO: ${dao.toBase58()}\n`);

  console.log("=== Recreating keyToAsset accounts ===\n");

  for (const config of nftConfigs) {
    const [keyToAssetAddr] = keyToAssetKey(dao, config.entityKey, "utf8");

    console.log(`${config.symbol} (${config.name}):`);
    console.log(`  Entity key: "${config.entityKey.toString("utf8")}"`);
    console.log(`  KeyToAsset PDA: ${keyToAssetAddr.toBase58()}`);
    console.log(`  Asset: ${config.asset.toBase58()}`);

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

    if (!argv.commit) {
      console.log(`  Would create keyToAsset:`);
      console.log(`    Address: ${keyToAssetAddr.toBase58()}`);
      console.log(`    Asset: ${config.asset.toBase58()}`);
      console.log(`\n`);
      continue;
    }

    // Recreate the keyToAsset
    console.log(`  Recreating keyToAsset...`);

    try {
      const tx = await hemProgram.methods
        .tempRecreateKeyToAssetV0({
          entityKey: config.entityKey,
          keySerialization: { utf8: {} },
          asset: config.asset,
        })
        .accounts({
          payer: provider.wallet.publicKey,
          dao,
          keyToAsset: keyToAssetAddr,
        })
        .signers([authority])
        .rpc({ skipPreflight: true });

      console.log(`  ✓ Created keyToAsset: ${keyToAssetAddr.toBase58()}`);
      console.log(`    Tx: ${tx}`);
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
