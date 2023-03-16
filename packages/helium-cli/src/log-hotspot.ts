import * as anchor from "@coral-xyz/anchor";
import { init as initHem, keyToAssetKey } from "@helium/helium-entity-manager-sdk";
import { daoKey } from "@helium/helium-sub-daos-sdk";
import { getAsset, HNT_MINT } from "@helium/spl-utils";
import { PublicKey } from "@solana/web3.js";
import os from "os";
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
  hotspotKey: {
    type: "string",
    describe: "Pubkey of the Data Credit token",
    required: true
  },
});

async function run() {
  const argv = await yarg.argv;
  process.env.ANCHOR_WALLET = argv.wallet;
  process.env.ANCHOR_PROVIDER_URL = argv.url;
  anchor.setProvider(anchor.AnchorProvider.local(argv.url));

  const provider = anchor.getProvider() as anchor.AnchorProvider;
  const hemProgram = await initHem(provider);

  const [keyToAssetK] = keyToAssetKey(daoKey(HNT_MINT)[0], argv.hotspotKey);
  const keyToAsset = await hemProgram.account.keyToAssetV0.fetch(keyToAssetK);
  console.log("keyToAsset", keyToAssetK.toBase58());
  PublicKey.prototype.toString = PublicKey.prototype.toBase58;

  console.log(keyToAsset);
  console.log(await getAsset(argv.url, keyToAsset.asset))
}

run()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .then(() => process.exit());
