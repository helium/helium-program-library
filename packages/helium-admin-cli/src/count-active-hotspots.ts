import * as anchor from "@coral-xyz/anchor";
import {
  init as initHem
} from "@helium/helium-entity-manager-sdk";
import os from "os";
import yargs from "yargs/yargs";

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
  });

  const argv = await yarg.argv;
  process.env.ANCHOR_WALLET = argv.wallet;
  process.env.ANCHOR_PROVIDER_URL = argv.url;
  anchor.setProvider(anchor.AnchorProvider.local(argv.url));

  const provider = anchor.getProvider() as anchor.AnchorProvider;
  const hemProgram = await initHem(provider);

  const hotspots = await hemProgram.account.iotHotspotInfoV0.all()
  console.log("IOT", hotspots.filter((h) => h.account.isActive).length);
  const mobileHotspots = await hemProgram.account.mobileHotspotInfoV0.all();
  console.log("MOBILE", mobileHotspots.filter((h) => h.account.isActive).length);
}
