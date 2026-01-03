import * as anchor from "@coral-xyz/anchor";
import {
  init as initHem,
  keyToAssetKey,
} from "@helium/helium-entity-manager-sdk";
import { daoKey, subDaoKey } from "@helium/helium-sub-daos-sdk";
import { carrierKey, init as initMem } from "@helium/mobile-entity-manager-sdk";
import {
  HNT_MINT,
  MOBILE_MINT,
  humanReadable,
  sendInstructions,
} from "@helium/spl-utils";
import {
  SPL_ACCOUNT_COMPRESSION_PROGRAM_ID,
  getConcurrentMerkleTreeAccountSize,
} from "@solana/spl-account-compression";
import {
  ComputeBudgetProgram,
  Keypair,
  PublicKey,
  SystemProgram,
} from "@solana/web3.js";
import fs from "fs";
import os from "os";
import yargs from "yargs/yargs";
import { exists, loadKeypair, merkleSizes } from "./utils";
const path = require("path");

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
    hntMint: {
      default: HNT_MINT.toBase58(),
    },
    dntMint: {
      default: MOBILE_MINT.toBase58(),
      describe: "Public Key of the subdao mint",
      type: "string",
    },
    name: {
      alias: "n",
      type: "string",
      required: true,
      describe: "The name of the carrier",
    },
    metadataUrl: {
      required: true,
      type: "string",
      describe: "Json metadata for the collection",
    },
    issuingAuthority: {
      alias: "m",
      type: "string",
      describe: "The pubkey that will approve issuance",
      required: true,
    },
    recipient: {
      describe:
        "Recipient of the rewardable carrier nft, default to this wallet",
      type: "string",
      required: false,
    },
    count: {
      alias: "c",
      type: "number",
      describe: "Estimated number of entities this carrier will have",
      required: true,
    },
    merkleBasePath: {
      type: "string",
      describe: "Base path for merkle keypair",
      default: path.join(__dirname, "..", "..", "keypairs"),
    },
    incentiveEscrowFundBps: {
      type: "number",
      describe: "The percentage of the SP rewards that are allocated to the incentive fund, in basis points",
      required: true,
    },
  });

  const argv = await yarg.argv;
  process.env.ANCHOR_WALLET = argv.wallet;
  process.env.ANCHOR_PROVIDER_URL = argv.url;
  anchor.setProvider(anchor.AnchorProvider.local(argv.url));
  const provider = anchor.getProvider() as anchor.AnchorProvider;

  const name = argv.name;

  const hemProgram = await initHem(provider);
  const memProgram = await initMem(provider);
  const conn = provider.connection;
  const dntMint = new PublicKey(argv.dntMint);
  const subDao = (await subDaoKey(dntMint))[0];

  const count = argv.count || 300000;
  const issuingAuthority = new PublicKey(argv.issuingAuthority);

  const [size, buffer, canopy] = merkleSizes.find(
    ([height]) => Math.pow(2, height) > count * 2
  )!;
  const space = getConcurrentMerkleTreeAccountSize(size, buffer, canopy);
  const carrier = await carrierKey(subDao, name)[0];
  const rent = await provider.connection.getMinimumBalanceForRentExemption(
    space
  );

  let merkle: Keypair;
  const merklePath = `${
    argv.merkleBasePath
  }/merkle-${issuingAuthority.toBase58()}.json`;
  if (fs.existsSync(merklePath)) {
    merkle = loadKeypair(merklePath);
  } else {
    merkle = Keypair.generate();
    fs.writeFileSync(merklePath, JSON.stringify(Array.from(merkle.secretKey)));
  }

  console.log(
    `
            Creating carrier with issuing authority: ${issuingAuthority.toBase58()}.
            Carrier: ${carrier.toBase58()}.
            Size: ${size}, buffer: ${buffer}, canopy: ${canopy}.
            Space: ${space} bytes
            Cost: ~${humanReadable(new anchor.BN(rent), 9)} Sol
            `
  );

  if (space > 10000000) {
    throw new Error(
      `Space ${space} more than 10mb for tree ${size}, ${buffer}, ${canopy}}`
    );
  }

  if (!(await exists(conn, carrier))) {
    console.log("Creating carrier");
    console.log(
      await memProgram.methods
        .initializeCarrierV0({
          name,
          issuingAuthority: issuingAuthority,
          updateAuthority: issuingAuthority,
          hexboostAuthority: issuingAuthority,
          metadataUrl: argv.metadataUrl,
          incentiveEscrowFundBps: argv.incentiveEscrowFundBps,
        })
        .preInstructions([
          ComputeBudgetProgram.setComputeUnitLimit({ units: 500000 }),
        ])
        .accountsPartial({
          subDao,
        })
        .rpc({ skipPreflight: true })
    );
  }

  if (!(await exists(conn, merkle.publicKey))) {
    console.log("Creating tree");
    await sendInstructions(
      provider,
      [
        SystemProgram.createAccount({
          fromPubkey: provider.wallet.publicKey,
          newAccountPubkey: merkle.publicKey,
          lamports: await provider.connection.getMinimumBalanceForRentExemption(
            space
          ),
          space: space,
          programId: SPL_ACCOUNT_COMPRESSION_PROGRAM_ID,
        }),
        await memProgram.methods
          .updateCarrierTreeV0({
            maxDepth: size,
            maxBufferSize: buffer,
          })
          .accountsPartial({
            carrier,
            newMerkleTree: merkle.publicKey,
          })
          .instruction(),
      ],
      [merkle]
    );
  }

  const hntMint = new PublicKey(argv.hntMint);
  const recipient = argv.recipient
    ? new PublicKey(argv.recipient)
    : provider.wallet.publicKey;
  const [keyToAssetK] = keyToAssetKey(
    daoKey(hntMint)[0],
    Buffer.from(name, "utf-8")
  );
  const keyToAsset = await hemProgram.account.keyToAssetV0.fetchNullable(
    keyToAssetK
  );

  if (!keyToAsset && issuingAuthority.equals(provider.wallet.publicKey)) {
    console.log("Minting carrier NFT");
    console.log(
      await memProgram.methods
        .issueCarrierNftV0({
          metadataUrl: `https://entities.nft.helium.io/${name}`,
        })
        .preInstructions([
          ComputeBudgetProgram.setComputeUnitLimit({ units: 500000 }),
        ])
        .accountsPartial({ carrier, recipient })
        .rpc({ skipPreflight: true })
    );
  }
}
