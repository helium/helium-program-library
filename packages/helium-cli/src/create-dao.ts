import {
  ThresholdType
} from "@helium/circuit-breaker-sdk";
import {
  dataCreditsKey,
  init as initDc
} from "@helium/data-credits-sdk";
import {
  daoKey,
  init as initDao
} from "@helium/helium-sub-daos-sdk";
import { init as initLazy } from "@helium/lazy-distributor-sdk";
import * as anchor from "@project-serum/anchor";
import { Connection, PublicKey } from "@solana/web3.js";
import { BN } from "bn.js";
import os from "os";
import yargs from "yargs/yargs";
import { createAndMint, loadKeypair } from "./utils";


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
  bucket: {
    type: "string",
    describe: "Bucket URL prefix holding all of the metadata jsons",
    default:
      "https://shdw-drive.genesysgo.net/CsDkETHRRR1EcueeN346MJoqzymkkr7RFjMqGpZMzAib",
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

  const hntKeypair = await loadKeypair(argv.hntKeypair);
  const dcKeypair = await loadKeypair(argv.dcKeypair);

  console.log("HNT", hntKeypair.publicKey.toBase58());
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
}

run()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .then(() => process.exit());

