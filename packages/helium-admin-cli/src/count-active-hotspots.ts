import * as anchor from "@coral-xyz/anchor";
import {
  init as initHem,
  iotInfoKey,
  keyToAssetKey,
  mobileInfoKey,
  rewardableEntityConfigKey,
} from "@helium/helium-entity-manager-sdk";
import { daoKey, subDaoKey } from "@helium/helium-sub-daos-sdk";
import {
  getAsset,
  getAssetProof,
  HNT_MINT,
  IOT_MINT,
  MOBILE_MINT,
  proofArgsAndAccounts,
} from "@helium/spl-utils";
import { PublicKey } from "@solana/web3.js";
import os from "os";
import yargs from "yargs/yargs";
import { exists } from "./utils";
import { Keypair as HeliumKeypair } from "@helium/crypto";
import bs58 from "bs58";
import { loadKeypair } from "./utils";
import {
  getLeafAssetId,
  TreeAuthorityIncorrectError,
} from "@metaplex-foundation/mpl-bubblegum";
import axios from "axios";

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
