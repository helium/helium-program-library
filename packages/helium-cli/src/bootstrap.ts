import {
  dataCreditsKey,
  init as initDc
} from "@helium-foundation/data-credits-sdk";
import {
  daoKey, init as initDao, subDaoKey
} from "@helium-foundation/helium-sub-daos-sdk";
import {
  init as initLazy
} from "@helium-foundation/lazy-distributor-sdk";
import { createAtaAndMintInstructions, createMintInstructions, createNft as createNft, sendInstructions, toBN } from "@helium-foundation/spl-utils";
import {
  createCreateMetadataAccountV3Instruction, PROGRAM_ID as METADATA_PROGRAM_ID
} from "@metaplex-foundation/mpl-token-metadata";
import * as anchor from "@project-serum/anchor";
import { getAssociatedTokenAddress } from "@solana/spl-token";
import {
  Keypair,
  PublicKey
} from "@solana/web3.js";
import fs from "fs";
import fetch from "node-fetch";
import os from "os";
import yargs from "yargs/yargs";
;;
const { hideBin } = require("yargs/helpers");
const yarg = yargs(hideBin(process.argv)).options({
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
  hntKeypair: {
    type: "string",
    describe: "Keypair of the HNT token",
    default: "./keypairs/hnt.json",
  },
  dcKeypair: {
    type: "string",
    describe: "Keypair of the Data Credit token",
    default: "./keypairs/dc.json",
  },
  mobileKeypair: {
    type: "string",
    describe: "Keypair of the Mobile token",
    default: "./keypairs/mobile.json",
  },
  mobileHotspotCollectionKeypair: {
    type: "string",
    describe: "Keypair of the Mobile hotspot collection token",
    default: "./keypairs/mobile-hotspot-collection.json",
  },
  numHnt: {
    type: "number",
    describe:
      "Number of HNT tokens to pre mint before assigning authority to lazy distributor",
    default: 100000,
  },
  numDc: {
    type: "number",
    describe:
      "Number of DC tokens to pre mint before assigning authority to lazy distributor",
    default: 100000,
  },
  numMobile: {
    type: "number",
    describe:
      "Number of MOBILE tokens to pre mint before assigning authority to lazy distributor",
    default: 100000,
  },
  bucket: {
    type: "string",
    describe: "Bucket URL prefix holding all of the metadata jsons",
    default:
      "https://shdw-drive.genesysgo.net/CsDkETHRRR1EcueeN346MJoqzymkkr7RFjMqGpZMzAib",
  },
});

const EPOCH_REWARDS = 100000000;

async function run() {
  const argv = await yarg.argv;
  process.env.ANCHOR_WALLET = argv.wallet;
  process.env.ANCHOR_PROVIDER_URL = argv.url;
  anchor.setProvider(anchor.AnchorProvider.local(argv.url));
  const provider = anchor.getProvider() as anchor.AnchorProvider;
  const dataCreditsProgram = await initDc(provider);
  const lazyDistributorProgram = await initLazy(provider);
  const heliumSubDaosProgram = await initDao(provider);


  const hntKeypair = await loadKeypair(argv.hntKeypair);
  const dcKeypair = await loadKeypair(argv.dcKeypair);
  const mobileKeypair = await loadKeypair(argv.mobileKeypair);
  const mobileHotspotCollectionKeypair = await loadKeypair(argv.mobileHotspotCollectionKeypair);
  await createAndMint({
    provider,
    mintKeypair: hntKeypair,
    amount: argv.numHnt,
    metadataUrl: `${argv.bucket}/hnt.json`,
  });
  await createAndMint({
    provider,
    mintKeypair: mobileKeypair,
    amount: argv.numMobile,
    metadataUrl: `${argv.bucket}/mobile.json`,
  });
  await createAndMint({
    provider,
    mintKeypair: dcKeypair,
    amount: argv.numDc,
    metadataUrl: `${argv.bucket}/dc.json`,
  });

  const dcKey = (await dataCreditsKey(dcKeypair.publicKey))[0];
  if (!(await provider.connection.getAccountInfo(dcKey))) {
    await dataCreditsProgram.methods
      .initializeDataCreditsV0({
        authority: provider.wallet.publicKey,
      })
      .accounts({ hntMint: hntKeypair.publicKey, dcMint: dcKeypair.publicKey })
      .rpc({ skipPreflight: true });
  }

  const dao = (await daoKey(hntKeypair.publicKey))[0];
  if (!(await provider.connection.getAccountInfo(dao))) {
    console.log("Initializing DAO");
    await heliumSubDaosProgram.methods
      .initializeDaoV0({
        authority: provider.wallet.publicKey,
        rewardPerEpoch: new anchor.BN(EPOCH_REWARDS),
      })
      .accounts({
        dcMint: dcKeypair.publicKey,
        hntMint: hntKeypair.publicKey,
      })
      .rpc({ skipPreflight: true });
  }

  const mobileSubdao = (await subDaoKey(mobileKeypair.publicKey))[0];
  if (!(await provider.connection.getAccountInfo(mobileSubdao))) {
    console.log("Initializing Mobile SubDAO");
    const mobileHotspotCollection = await createNft(
      provider,
      provider.wallet.publicKey,
      {
        name: "Mobile Hotspot Collection",
        symbol: "MOBILEHOT",
        uri: `${argv.bucket}/mobile_collection.json`,
      },
      undefined,
      mobileHotspotCollectionKeypair
    );
    await heliumSubDaosProgram.methods
      .initializeSubDaoV0({
        authority: provider.wallet.publicKey,
      })
      .accounts({
        dao,
        subDaoMint: mobileKeypair.publicKey,
        hotspotCollection: mobileHotspotCollection.mintKey,
        treasury: await getAssociatedTokenAddress(
          mobileKeypair.publicKey,
          provider.wallet.publicKey
        ),
        mint: mobileKeypair.publicKey,
      });
  }
}

async function createAndMint({
  provider,
  mintKeypair,
  amount,
  metadataUrl
}: {
  provider: anchor.AnchorProvider,
  mintKeypair: Keypair,
  amount: number,
  metadataUrl: string
}): Promise<void> {
  const metadata = await fetch(metadataUrl).then((r) => r.json());

  if (!(await provider.connection.getAccountInfo(mintKeypair.publicKey))) {
    console.log(`${metadata.name} Mint not found, creating...`);
    await sendInstructions(
      provider,
      [
        ...(await createMintInstructions(
          provider,
          8,
          provider.wallet.publicKey,
          provider.wallet.publicKey,
          mintKeypair
        )),
        ...(
          await createAtaAndMintInstructions(
            provider,
            mintKeypair.publicKey,
            toBN(amount, 8)
          )
        ).instructions,
      ],
      [mintKeypair]
    );
  }

  const metadataAddress = (await PublicKey.findProgramAddress(
    [Buffer.from("metadata", "utf-8"), METADATA_PROGRAM_ID.toBuffer(), mintKeypair.publicKey.toBuffer()],
    METADATA_PROGRAM_ID
  ))[0];

  if (!(await provider.connection.getAccountInfo(metadataAddress))) {
    console.log(`${metadata.name} Metadata not found, creating...`);
    await sendInstructions(provider, [
      await createCreateMetadataAccountV3Instruction(
        {
          metadata: metadataAddress,
          mint: mintKeypair.publicKey,
          mintAuthority: provider.wallet.publicKey,
          payer: provider.wallet.publicKey,
          updateAuthority: provider.wallet.publicKey,
        },
        {
          createMetadataAccountArgsV3: {
            data: {
              name: metadata.name,
              symbol: metadata.symbol,
              uri: metadataUrl,
              sellerFeeBasisPoints: 0,
              creators: [
                {
                  address: provider.wallet.publicKey,
                  verified: true,
                  share: 100,
                },
              ],
              collection: null,
              uses: null,
            },
            isMutable: true,
            collectionDetails: null,
          },
        }
      ),
    ]);
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
}).then(() => process.exit());

function loadKeypair(keypair: string): Keypair {
  console.log(process.env.ANCHOR_PROVIDER_URL);
  anchor.setProvider(anchor.AnchorProvider.env());
  const provider = anchor.getProvider() as anchor.AnchorProvider;

  return Keypair.fromSecretKey(
    new Uint8Array(
      JSON.parse(fs.readFileSync(keypair).toString())
    )
  );
}

