import {
  thresholdPercent,
  ThresholdType
} from "@helium/circuit-breaker-sdk";
import Address from "@helium/address";
import {
  dataCreditsKey,
  init as initDc
} from "@helium/data-credits-sdk";
import {
  daoKey,
  init as initDao,
  subDaoKey
} from "@helium/helium-sub-daos-sdk";
import {
  hotspotCollectionKey, hotspotConfigKey, hotspotIssuerKey, init as initHem
} from "@helium/helium-entity-manager-sdk";
import { lazyDistributorKey, init as initLazy } from "@helium/lazy-distributor-sdk";
import { createAtaAndMintInstructions, createAtaAndMint, createMintInstructions, createNft, sendInstructions, toBN } from "@helium/spl-utils";
import { toU128 } from "@helium/treasury-management-sdk";
import {
  createCreateMetadataAccountV3Instruction,
  PROGRAM_ID as METADATA_PROGRAM_ID
} from "@metaplex-foundation/mpl-token-metadata";
import * as anchor from "@project-serum/anchor";
import { getAssociatedTokenAddress } from "@solana/spl-token";
import {
  Connection,
  Keypair,
  PublicKey,
  ComputeBudgetProgram,
} from "@solana/web3.js";
import { BN } from "bn.js";
import fs from "fs";
import fetch from "node-fetch";
import os from "os";
import yargs from "yargs/yargs";


type Hotspot = {
  eccKey: string;
  uri: string;
  mint?: PublicKey;
}

const hardcodeHotspots: Hotspot[] = [
  {
    eccKey: "112UE9mbEB4NWHgdutev5PXTszp1V8HwBptwNMDQVc6fAyu34Tz4",
    uri: "https://mobile-metadata.test-helium.com/112UE9mbEB4NWHgdutev5PXTszp1V8HwBptwNMDQVc6fAyu34Tz4",
  },
  {
    eccKey: "11bNfVbDL8Tp2T6jsEevRzBG5QuJpHVUz1Z21ACDcD4wW6RbVAZ",
    uri: "https://mobile-metadata.test-helium.com/11bNfVbDL8Tp2T6jsEevRzBG5QuJpHVUz1Z21ACDcD4wW6RbVAZ",
  },
  {
    eccKey: "11wsqKcoXGesnSbEwKTY8QkoqdFsG7oafcyPn8jBnzRK4sfCSw8",
    uri: "https://mobile-metadata.test-helium.com/11wsqKcoXGesnSbEwKTY8QkoqdFsG7oafcyPn8jBnzRK4sfCSw8",
  },
  {
    eccKey: "11t1Yvm7QbyVnmqdCUpfA8XUiGVbpHPVnaNtR25gb8p2d4Dzjxi",
    uri: "https://mobile-metadata.test-helium.com/11t1Yvm7QbyVnmqdCUpfA8XUiGVbpHPVnaNtR25gb8p2d4Dzjxi",
  },
];

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
  onboardingServerKeypair: {
    type: "string",
    describe: "Keypair of the onboarding server",
    default: `${os.homedir()}/.config/solana/id.json`,
  },
  makerKeypair: {
    type: "string",
    describe: "Keypair of a maker",
    default: `${os.homedir()}/.config/solana/id.json`,
  },
  numHnt: {
    type: "number",
    describe:
      "Number of HNT tokens to pre mint before assigning authority to lazy distributor",
    default: 0,
  },
  numDc: {
    type: "number",
    describe:
      "Number of DC tokens to pre mint before assigning authority to lazy distributor",
    default: 1000,
  },
  numMobile: {
    type: "number",
    describe:
      "Number of MOBILE tokens to pre mint before assigning authority to lazy distributor",
    default: 0,
  },
  bucket: {
    type: "string",
    describe: "Bucket URL prefix holding all of the metadata jsons",
    default:
      "https://shdw-drive.genesysgo.net/CsDkETHRRR1EcueeN346MJoqzymkkr7RFjMqGpZMzAib",
  },
  oracleUrl: {
    alias: "o",
    type: "string",
    describe: "The oracle URL",
    default: "http://localhost:8080",
  },
  oracleKeypair: {
    type: "string",
    describe: "Keypair of the oracle",
    default: "./keypairs/oracle.json",
  },
});

const HNT_EPOCH_REWARDS = 10000000000;
const MOBILE_EPOCH_REWARDS = 5000000000;
async function exists(connection: Connection, account: PublicKey): Promise<boolean> {
  return Boolean(await connection.getAccountInfo(account));
}


async function run() {
  const argv = await yarg.argv;
  process.env.ANCHOR_WALLET = argv.wallet;
  process.env.ANCHOR_PROVIDER_URL = argv.url;
  anchor.setProvider(anchor.AnchorProvider.local(argv.url));

  const provider = anchor.getProvider() as anchor.AnchorProvider;
  const dataCreditsProgram = await initDc(provider);
  const lazyDistributorProgram = await initLazy(provider);
  const heliumSubDaosProgram = await initDao(provider);
  const hemProgram = await initHem(provider);

  const hntKeypair = await loadKeypair(argv.hntKeypair);
  const dcKeypair = await loadKeypair(argv.dcKeypair);
  const mobileKeypair = await loadKeypair(argv.mobileKeypair);
  const onboardingServerKeypair = await loadKeypair(
    argv.onboardingServerKeypair
  );
  const makerKeypair = await loadKeypair(argv.makerKeypair);
  const oracleKeypair = loadKeypair(argv.oracleKeypair);
  const oracleKey = oracleKeypair.publicKey;
  const oracleUrl = argv.oracleUrl;

  console.log("HNT", hntKeypair.publicKey.toBase58());
  console.log("MOBILE", mobileKeypair.publicKey.toBase58());
  console.log("DC", dcKeypair.publicKey.toBase58());

  const conn = provider.connection;

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
    decimals: 0,
    metadataUrl: `${argv.bucket}/dc.json`,
  });

  const dcKey = (await dataCreditsKey(dcKeypair.publicKey))[0];
  if (!(await exists(conn, dcKey))) {
    await dataCreditsProgram.methods
      .initializeDataCreditsV0({
        authority: provider.wallet.publicKey,
        config: {
          windowSizeSeconds: new BN(60 * 60),
          thresholdType: ThresholdType.Absolute as never,
          threshold: new BN("1000000000000"),
        },
      })
      .accounts({ hntMint: hntKeypair.publicKey, dcMint: dcKeypair.publicKey })
      .rpc({ skipPreflight: true });
  }

  const dao = (await daoKey(hntKeypair.publicKey))[0];
  if (!(await exists(conn, dao))) {
    console.log("Initializing DAO");
    await heliumSubDaosProgram.methods
      .initializeDaoV0({
        authority: provider.wallet.publicKey,
        emissionSchedule: [{
          startUnixTime: new anchor.BN(0),
          emissionsPerEpoch: new anchor.BN(HNT_EPOCH_REWARDS),
        }],
      })
      .accounts({
        dcMint: dcKeypair.publicKey,
        hntMint: hntKeypair.publicKey,
      })
      .rpc({ skipPreflight: true });
  }

  const mobileSubdao = (await subDaoKey(mobileKeypair.publicKey))[0];
  const [mobileLazyDist] = await lazyDistributorKey(mobileKeypair.publicKey);
  const rewardsEscrow = await getAssociatedTokenAddress(
    mobileKeypair.publicKey,
    mobileLazyDist,
    true
  );
  if (!(await exists(conn, mobileLazyDist))) {
    console.log("Initializing mobile lazy distributor");
    await lazyDistributorProgram.methods
      .initializeLazyDistributorV0({
        authority: provider.wallet.publicKey,
        oracles: [
          {
            oracle: oracleKey,
            url: oracleUrl,
          },
        ],
        // 10 x epoch rewards in a 24 hour period
        windowConfig: {
          windowSizeSeconds: new anchor.BN(24 * 60 * 60),
          thresholdType: ThresholdType.Absolute as never,
          threshold: new anchor.BN(10 * MOBILE_EPOCH_REWARDS),
        },
      })
      .accounts({
        rewardsMint: mobileKeypair.publicKey,
        rewardsEscrow,
      })
      .rpc({ skipPreflight: true });
  }


  if (!(await exists(conn, mobileSubdao))) {
    console.log("Initializing Mobile SubDAO");
    await heliumSubDaosProgram.methods
      .initializeSubDaoV0({
        authority: provider.wallet.publicKey,
        emissionSchedule: [
          {
            startUnixTime: new anchor.BN(0),
            emissionsPerEpoch: new anchor.BN(MOBILE_EPOCH_REWARDS),
          },
        ],
        // Linear curve
        treasuryCurve: {
          exponentialCurveV0: {
            k: toU128(1),
          },
        } as any,
        // 20% in a day
        treasuryWindowConfig: {
          windowSizeSeconds: new anchor.BN(24 * 60 * 60),
          thresholdType: ThresholdType.Percent as never,
          threshold: thresholdPercent(20),
        },
      })
      .accounts({
        dao,
        dntMint: mobileKeypair.publicKey,
        rewardsEscrow,
        hntMint: hntKeypair.publicKey,
      })
      .rpc({ skipPreflight: true });
  }

  const hsConfigKey = (await hotspotConfigKey(mobileSubdao, "MOBILE"))[0];
  if (!(await provider.connection.getAccountInfo(hsConfigKey))) {
    console.log("Initalizing `MOBILE` HotspotConfig");

    await hemProgram.methods
      .initializeHotspotConfigV0({
        name: "Mobile Hotspot Collection",
        symbol: "MOBILE",
        metadataUrl: `${argv.bucket}/mobile_collection.json`,
        dcFee: toBN(5, 0),
        onboardingServer: onboardingServerKeypair.publicKey,
        minGain: 10,
        maxGain: 150,
        fullLocationStakingFee: toBN(1000000, 8),
        dataonlyLocationStakingFee: toBN(500000, 8),
      })
      .accounts({ dcMint: dcKeypair.publicKey, subDao: mobileSubdao })
      .rpc({ skipPreflight: true });
  }

  const hsIssuerKey = await hotspotIssuerKey(
    hsConfigKey,
    makerKeypair.publicKey
  )[0];

  if (!(await exists(conn, hsIssuerKey))) {
    console.log("Initalizing HotspotIssuer");

    await hemProgram.methods
      .initializeHotspotIssuerV0({
        maker: makerKeypair.publicKey,
        authority: provider.wallet.publicKey,
      })
      .accounts({
        hotspotConfig: hsConfigKey,
      })
      .rpc({ skipPreflight: true });
  }
  
  await Promise.all(
    hardcodeHotspots.map(async (hotspot, index) => {
      const create = await hemProgram.methods
        .issueHotspotV0({
          eccCompact: Buffer.from(Address.fromB58(hotspot.eccKey).publicKey),
          uri: hotspot.uri,
          isFullHotspot: true,
        })
        .preInstructions([
          ComputeBudgetProgram.setComputeUnitLimit({ units: 350000 }),
        ])
        .accounts({
          hotspotIssuer: hsIssuerKey,
          hotspotOwner: provider.wallet.publicKey,
          maker: makerKeypair.publicKey,
        })
        .signers([makerKeypair]);
      const key = (await create.pubkeys()).hotspot!;
      if (!(await exists(conn, key))) {
        console.log("Creating hotspot", index);
        await create.rpc({ skipPreflight: true });
      }
    })
  );
}

async function createAndMint({
  provider,
  mintKeypair = Keypair.generate(),
  amount,
  metadataUrl,
  decimals = 8
}: {
  provider: anchor.AnchorProvider,
  mintKeypair?: Keypair,
  amount: number,
  metadataUrl: string,
  decimals?: number
}): Promise<void> {
  const metadata = await fetch(metadataUrl).then((r) => r.json());

  if (!(await exists(provider.connection, mintKeypair.publicKey))) {
    console.log(`${metadata.name} Mint not found, creating...`);
    await sendInstructions(
      provider,
      [
        ...(await createMintInstructions(
          provider,
          decimals,
          provider.wallet.publicKey,
          provider.wallet.publicKey,
          mintKeypair
        )),
        ...(
          await createAtaAndMintInstructions(
            provider,
            mintKeypair.publicKey,
            toBN(amount, decimals)
          )
        ).instructions,
      ],
      [mintKeypair]
    );
  }

  const metadataAddress = (
    await PublicKey.findProgramAddress(
      [
        Buffer.from("metadata", "utf-8"),
        METADATA_PROGRAM_ID.toBuffer(),
        mintKeypair.publicKey.toBuffer(),
      ],
      METADATA_PROGRAM_ID
    )
  )[0];

  if (!(await exists(provider.connection, metadataAddress))) {
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

run()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .then(() => process.exit());

export function loadKeypair(keypair: string): Keypair {
  console.log(process.env.ANCHOR_PROVIDER_URL);
  anchor.setProvider(anchor.AnchorProvider.env());
  const provider = anchor.getProvider() as anchor.AnchorProvider;

  return Keypair.fromSecretKey(
    new Uint8Array(JSON.parse(fs.readFileSync(keypair).toString()))
  );
}
