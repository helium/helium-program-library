import * as anchor from "@coral-xyz/anchor";
import {
  init as initHem,
  keyToAssetKey,
} from "@helium/helium-entity-manager-sdk";
import bs58 from "bs58";
import { daoKey } from "@helium/helium-sub-daos-sdk";
import { getAssets, HNT_MINT } from "@helium/spl-utils";
import { PublicKey } from "@solana/web3.js";
import fs from "fs";
import os from "os";
import pLimit from "p-limit";
import yargs from "yargs/yargs";
import { loadKeypair } from "./utils";

const PARALLEL_BATCHES = 10;

interface JsonEntry {
  address: string;
  asset: string;
  hntRecipientKey: string;
  mobileRecipientKey: string;
  hntSignatureCount: number;
  mobileSignatureCount: number;
  encodedEntityKey: string;
}

const BATCH_SIZE = 100;

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
      describe: "Path to JSON file with entries to process",
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

  console.log(`DAO: ${dao.toBase58()}`);

  const inputPath = argv.inputFile as string;
  console.log(`Input file: ${inputPath}\n`);

  const rawData = fs.readFileSync(inputPath, "utf-8");
  const entries: JsonEntry[] = JSON.parse(rawData);
  console.log(`Loaded ${entries.length} entries from JSON file\n`);

  console.log("=== Recreating keyToAsset accounts ===\n");

  const totals = { created: 0, skipped: 0, failed: 0 };
  const batchLimiter = pLimit(PARALLEL_BATCHES);

  // Split into batches
  const batches: JsonEntry[][] = [];
  for (let i = 0; i < entries.length; i += BATCH_SIZE) {
    batches.push(entries.slice(i, i + BATCH_SIZE));
  }

  console.log(
    `Processing ${batches.length} batches of ${BATCH_SIZE} entries (${PARALLEL_BATCHES} parallel)\n`
  );

  let completedBatches = 0;

  await Promise.all(
    batches.map((batch, batchIndex) =>
      batchLimiter(async () => {
        const batchNum = batchIndex + 1;
        const prefix = `[Batch ${batchNum}/${batches.length}]`;
        let batchCreated = 0;
        let batchSkipped = 0;
        let batchFailed = 0;

        const assetPubkeys = batch.map((e) => new PublicKey(e.asset));
        const assets = await getAssets(
          provider.connection.rpcEndpoint,
          assetPubkeys
        );

        for (let j = 0; j < batch.length; j++) {
          const entry = batch[j];
          const asset = assets[j];

          if (!asset) {
            console.log(`${prefix} Asset ${entry.asset}: not found in DAS`);
            batchFailed++;
            continue;
          }

          const entityKeyStr = entry.encodedEntityKey;
          const symbol = asset.content.metadata.symbol;
          const isUtf8 = ["IOT OPS", "CARRIER"].includes(symbol);
          const keySerialization: "utf8" | "b58" = isUtf8 ? "utf8" : "b58";

          const entityKeyBuffer = isUtf8
            ? Buffer.from(entityKeyStr, "utf8")
            : Buffer.from(bs58.decode(entityKeyStr));

          // Verify entity key by deriving PDA and matching against input address
          const [derivedKeyToAsset] = keyToAssetKey(
            dao,
            entityKeyStr,
            keySerialization
          );
          const expectedKeyToAsset = new PublicKey(entry.address);

          if (!derivedKeyToAsset.equals(expectedKeyToAsset)) {
            console.error(`\n${prefix} ❌ KEY-TO-ASSET DERIVATION MISMATCH`);
            console.error(`\n  🎯 PROBLEM:`);
            console.error(
              `     The keyToAsset PDA derived from the entity key doesn't match`
            );
            console.error(
              `     the expected keyToAsset address from the input data. This likely means:`
            );
            console.error(
              `     - The entity key in the input file is incorrect, or`
            );
            console.error(
              `     - The serialization format (utf8 vs b58) is incorrect, or`
            );
            console.error(
              `     - The expected keyToAsset address in the input file is wrong`
            );

            console.error(`\n  📋 INPUT DATA (from JSON file):`);
            console.error(`     Expected keyToAsset address: ${entry.address}`);
            console.error(`     Asset public key:            ${entry.asset}`);
            console.error(`     Entity key (string):         ${entityKeyStr}`);

            console.error(`\n  🔑 ENTITY KEY PROCESSING:`);
            console.error(
              `     Serialization format:        ${keySerialization} (based on symbol: ${symbol})`
            );
            console.error(
              `     Entity key (hex):            ${entityKeyBuffer.toString(
                "hex"
              )}`
            );
            console.error(
              `     Entity key (bytes):          [${entityKeyBuffer.length} bytes]`
            );

            console.error(`\n  ⚖️  PDA COMPARISON:`);
            console.error(
              `     Derived keyToAsset PDA:      ${derivedKeyToAsset.toBase58()}`
            );
            console.error(
              `     Expected keyToAsset PDA:     ${expectedKeyToAsset.toBase58()}`
            );
            console.error(`     Match:                       ❌ NO`);
            console.error(`\n  📦 ASSET METADATA (from DAS):`);
            console.error(
              `     Name:                        ${asset.content.metadata.name}`
            );
            console.error(`     Symbol:                      ${symbol}`);
            console.error(
              `     JSON URI:                    ${asset.content.json_uri}`
            );
            console.error(
              `     Owner:                       ${asset.ownership.owner}`
            );
            console.error(
              `     Delegate:                    ${
                asset.ownership.delegate || "(none)"
              }`
            );
            console.error(
              `     Collection:                  ${
                asset.grouping?.find((g) => g.group_key === "collection")
                  ?.group_value || "(none)"
              }`
            );
            if (asset.creators && asset.creators.length > 0) {
              console.error(
                `     Creators:                    ${asset.creators
                  .map(
                    (c) => `${c.address} (${c.share}%${c.verified ? " ✓" : ""})`
                  )
                  .join(", ")}`
              );
            }
            console.error(``);
            batchFailed++;
            continue;
          }

          const keyToAssetAddr = expectedKeyToAsset;

          const existingKeyToAsset =
            await hemProgram.account.keyToAssetV0.fetchNullable(keyToAssetAddr);

          if (existingKeyToAsset) {
            batchSkipped++;
            continue;
          }

          if (!argv.commit) {
            batchCreated++;
            continue;
          }

          try {
            await hemProgram.methods
              .tempRecreateKeyToAssetV0({
                entityKey: entityKeyBuffer,
                keySerialization: isUtf8 ? { utf8: {} } : { b58: {} },
                asset: new PublicKey(entry.asset),
              })
              .accounts({
                payer: provider.wallet.publicKey,
                dao,
                keyToAsset: keyToAssetAddr,
              })
              .signers([authority])
              .rpc({ skipPreflight: true });

            batchCreated++;
          } catch (err: unknown) {
            const message = err instanceof Error ? err.message : String(err);
            console.error(`${prefix} Failed ${entry.asset}: ${message}`);
            batchFailed++;
          }
        }

        totals.created += batchCreated;
        totals.skipped += batchSkipped;
        totals.failed += batchFailed;
        completedBatches++;

        console.log(
          `${prefix} Done (${completedBatches}/${batches.length}) - created: ${batchCreated}, skipped: ${batchSkipped}, failed: ${batchFailed}`
        );
      })
    )
  );

  console.log("\n=== Summary ===");
  console.log(`Created: ${totals.created}`);
  console.log(`Skipped (already exists): ${totals.skipped}`);
  console.log(`Failed: ${totals.failed}`);
  if (!argv.commit) {
    console.log("\nDry run complete. Re-run with --commit to execute.");
  }
}
