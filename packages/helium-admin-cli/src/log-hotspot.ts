import * as anchor from "@coral-xyz/anchor";
import {
  init as initHem,
  iotInfoKey,
  keyToAssetKey,
  mobileInfoKey,
  rewardableEntityConfigKey,
} from "@helium/helium-entity-manager-sdk";
import { daoKey, subDaoKey } from "@helium/helium-sub-daos-sdk";
import { getAsset, HNT_MINT, IOT_MINT, MOBILE_MINT } from "@helium/spl-utils";
import { PublicKey } from "@solana/web3.js";
import os from "os";
import yargs from "yargs/yargs";
import { exists } from "./utils";

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
    hotspotKey: {
      type: "string",
      describe: "Pubkey of the Data Credit token",
      required: true,
    },
  });
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
  console.log(await getAsset(argv.url, keyToAsset.asset));

  const [iotConfigKey] = rewardableEntityConfigKey(
    subDaoKey(IOT_MINT)[0],
    "IOT"
  );
  const [mobileConfigKey] = rewardableEntityConfigKey(
    subDaoKey(MOBILE_MINT)[0],
    "MOBILE"
  );

  const [iotInfo] = await iotInfoKey(iotConfigKey, argv.hotspotKey);
  if (await exists(provider.connection, iotInfo)) {
    console.log(
      "Iot Info",
      await hemProgram.account.iotHotspotInfoV0.fetchNullable(iotInfo)
    );
  } else {
    console.log("No iot info")
  }

  const [info] = await mobileInfoKey(mobileConfigKey, argv.hotspotKey);
  if (await exists(provider.connection, info)) {
    console.log(
      "Mobile Info",
      await hemProgram.account.mobileHotspotInfoV0.fetchNullable(info)
    );
  } else {
    console.log("No mobile info")
  }
}
