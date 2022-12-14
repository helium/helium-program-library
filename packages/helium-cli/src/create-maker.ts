import {
  hotspotConfigKey,
  hotspotIssuerKey,
  init as initHem
} from "@helium/helium-entity-manager-sdk";
import {
  subDaoKey
} from "@helium/helium-sub-daos-sdk";
import * as anchor from "@project-serum/anchor";
import {
  PublicKey
} from "@solana/web3.js";
import Address from "@helium/address";
import os from "os";
import yargs from "yargs/yargs";
import { exists } from "./utils";

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
  name: {
    alias: "n",
    describe: "The name of the subdao",
    type: "string",
    required: true,
  },
  makerKey: {
    alias: "m",
    type: "string",
    describe: "*Helium* Public Key of a maker",
    required: true,
  },
  subdaoMint: {
    required: true,
    describe: "Public Key of the subdao mint",
    type: "string",
  },
});

async function run() {
  const argv = await yarg.argv;
  console.log(argv.url);
  process.env.ANCHOR_WALLET = argv.wallet;
  process.env.ANCHOR_PROVIDER_URL = argv.url;
  anchor.setProvider(anchor.AnchorProvider.local(argv.url));

  const name = argv.name;

  const provider = anchor.getProvider() as anchor.AnchorProvider;
  const hemProgram = await initHem(provider);
  const makerKey = new PublicKey(Address.fromB58(argv.makerKey).publicKey);
  console.log(`Using maker with helium addr: ${argv.makerKey}, solana addr: ${makerKey.toBase58()}`);

  const conn = provider.connection;

  const subdaoMint = new PublicKey(argv.subdaoMint);
  const subdao = (await subDaoKey(subdaoMint))[0];
  const hsConfigKey = (await hotspotConfigKey(subdao, name.toUpperCase()))[0];

  const hsIssuerKey = await hotspotIssuerKey(
    hsConfigKey,
    makerKey
  )[0];

  console.log("Issuer: ", await hemProgram.account.hotspotIssuerV0.fetch(hsIssuerKey));
  if (!(await exists(conn, hsIssuerKey))) {
    console.log("Initalizing HotspotIssuer");

    await hemProgram.methods
      .initializeHotspotIssuerV0({
        maker: makerKey,
        authority: provider.wallet.publicKey,
      })
      .accounts({
        hotspotConfig: hsConfigKey,
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
