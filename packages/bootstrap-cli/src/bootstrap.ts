import { sendInstructions } from "@helium-foundation/spl-utils";
import * as anchor from "@project-serum/anchor";
import fetch from "node-fetch";
import {
  createAssociatedTokenAccountInstruction,
  createInitializeMintInstruction, createMintToInstruction, getAssociatedTokenAddress, TOKEN_PROGRAM_ID
} from "@solana/spl-token";
import {
  init as initDc,
  isInitialized,
} from "@helium-foundation/data-credits-sdk";
import {
  init as initLazy,
} from "@helium-foundation/lazy-distributor-sdk";
import {
  init as initDao,
  daoKey
} from "@helium-foundation/helium-sub-daos-sdk";
import {
  SystemProgram, Keypair,
  PublicKey,
  TransactionInstruction,
  Transaction,
} from "@solana/web3.js";
import {
  createCreateMasterEditionV3Instruction,
  createCreateMetadataAccountV3Instruction,
  createVerifyCollectionInstruction,
  PROGRAM_ID as METADATA_PROGRAM_ID,
} from "@metaplex-foundation/mpl-token-metadata";
import os from "os";
import fs from "fs";
import yargs from "yargs/yargs";

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
    default: "./dc.json",
  },
  mobileKeypair: {
    type: "string",
    describe: "Keypair of the Mobile token",
    default: "./mobile.json",
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
  const dcKeypair = await loadKeypair(argv.hntKeypair);
  const mobileKeypair = await loadKeypair(argv.hntKeypair);
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

  await dataCreditsProgram.methods
    .initializeDataCreditsV0({
      authority: provider.wallet.publicKey,
    })
    .accounts({ hntMint: hntKeypair.publicKey, dcMint: dcKeypair.publicKey })
    .rpc();

  const dao = (await daoKey(hntKeypair.publicKey))[0];
  if (!(await provider.connection.getAccountInfo(dao))) {
    console.log("Initializing DAO");
    await heliumSubDaosProgram.methods
      .initializeDaoV0({
        authority: provider.wallet.publicKey,
        rewardPerEpoch: new anchor.BN(EPOCH_REWARDS),
      })
      .accounts({
        mint: hntKeypair.publicKey,
      })
      .rpc();
  }

  const mobileSubdao = (await daoKey(hntKeypair.publicKey))[0];
  if (!(await provider.connection.getAccountInfo(mobileSubdao))) {
    console.log("Initializing Mobile SubDAO");
    await heliumSubDaosProgram.methods
      .initializeSubDaoV0({
        authority: provider.wallet.publicKey,
      })
      .accounts({
        dao,
        subDaoMint: mobileKeypair.publicKey,
        hotspotCollection: hntKeypair.publicKey, // TODO: change this
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
            amount * 10 ** 8
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

export async function createMintInstructions(
  provider: anchor.AnchorProvider,
  decimals: number,
  mintAuthority: PublicKey,
  freezeAuthority: PublicKey | null = null,
  mintKeypair: Keypair = Keypair.generate()
): Promise<TransactionInstruction[]> {
  const mintKey = mintKeypair.publicKey;
  return [
    SystemProgram.createAccount({
      fromPubkey: provider.wallet.publicKey,
      newAccountPubkey: mintKey,
      space: 82,
      lamports: await provider.connection.getMinimumBalanceForRentExemption(82),
      programId: TOKEN_PROGRAM_ID,
    }),
    await createInitializeMintInstruction(
      mintKeypair.publicKey,
      decimals,
      mintAuthority,
      freezeAuthority
    ),
  ];
}

export async function createAtaAndMintInstructions(
  provider: anchor.AnchorProvider,
  mint: PublicKey,
  amount: number,
  to: PublicKey = provider.wallet.publicKey,
  authority: PublicKey = provider.wallet.publicKey,
  payer: PublicKey = provider.wallet.publicKey
): Promise<{ instructions: TransactionInstruction[]; ata: PublicKey }> {
  const ata = await getAssociatedTokenAddress(mint, to);
  const instructions: TransactionInstruction[] = [];
  if (!(await provider.connection.getAccountInfo(ata))) {
    instructions.push(
      createAssociatedTokenAccountInstruction(payer, ata, to, mint)
    );
  }
  instructions.push(createMintToInstruction(mint, ata, authority, amount));

  return {
    instructions,
    ata,
  };
}

export async function createAtaAndMint(
  provider: anchor.AnchorProvider,
  mint: PublicKey,
  amount: number,
  to: PublicKey = provider.wallet.publicKey,
  authority: PublicKey = provider.wallet.publicKey,
  payer: PublicKey = provider.wallet.publicKey,
  confirmOptions: any = undefined
): Promise<PublicKey> {
  const mintTx = new Transaction();
  const { instructions, ata } = await createAtaAndMintInstructions(
    provider,
    mint,
    amount,
    to,
    authority,
    payer
  );
  mintTx.add(...instructions);

  try {
    await provider.sendAndConfirm(mintTx, undefined, confirmOptions);
  } catch (e: any) {
    console.log("Error", e, e.logs);
    if (e.logs) {
      console.error(e.logs.join("\n"));
    }
    throw e;
  }
  return ata;
}

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

