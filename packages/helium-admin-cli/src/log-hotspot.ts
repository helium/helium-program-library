import * as anchor from "@coral-xyz/anchor";
import {
  init as initHem,
  iotInfoKey,
  keyToAssetKey,
  mobileInfoKey,
  rewardableEntityConfigKey,
} from "@helium/helium-entity-manager-sdk";
import { lazyDistributorKey, recipientKey, init as initLazy } from "@helium/lazy-distributor-sdk";
import { daoKey, subDaoKey } from "@helium/helium-sub-daos-sdk";
import {
  getAsset,
  getAssetProof,
  HNT_MINT,
  IOT_MINT,
  MOBILE_MINT,
} from "@helium/spl-utils";
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
    entityKey: {
      type: "string",
      describe: "Pubkey of the Data Credit token",
      required: true,
    },
    keySerialization: {
      type: "string",
      default: "b58",
    },
  });
  const argv = await yarg.argv;
  process.env.ANCHOR_WALLET = argv.wallet;
  process.env.ANCHOR_PROVIDER_URL = argv.url;
  anchor.setProvider(anchor.AnchorProvider.local(argv.url));

  const provider = anchor.getProvider() as anchor.AnchorProvider;
  const hemProgram = await initHem(provider);
  const lazyProgram = await initLazy(provider);

  const [keyToAssetK] = keyToAssetKey(
    daoKey(HNT_MINT)[0],
    argv.entityKey,
    // @ts-ignore
    argv.keySerialization!
  );
  const keyToAsset = await hemProgram.account.keyToAssetV0.fetchNullable(
    keyToAssetK
  );
  console.log("keyToAsset", keyToAssetK.toBase58());
  PublicKey.prototype.toString = PublicKey.prototype.toBase58;

  console.log(keyToAsset);
  console.log(await getAsset(argv.url, keyToAsset!.asset));
  console.log(await getAssetProof(argv.url, keyToAsset!.asset));

  const [iotConfigKey] = rewardableEntityConfigKey(
    subDaoKey(IOT_MINT)[0],
    "IOT"
  );
  const [mobileConfigKey] = rewardableEntityConfigKey(
    subDaoKey(MOBILE_MINT)[0],
    "MOBILE"
  );

  const [iotInfo] = await iotInfoKey(iotConfigKey, argv.entityKey);
  if (await exists(provider.connection, iotInfo)) {
    console.log(
      "Iot Info",
      await hemProgram.account.iotHotspotInfoV0.fetchNullable(iotInfo)
    );
  } else {
    console.log("No iot info");
  }

  const [info] = await mobileInfoKey(mobileConfigKey, argv.entityKey);
  if (await exists(provider.connection, info)) {
    console.log(
      "Mobile Info",
      await hemProgram.account.mobileHotspotInfoV0.fetchNullable(info)
    );
  } else {
    console.log("No mobile info");
  }

  if (keyToAsset) {
    const iotLazy = lazyDistributorKey(IOT_MINT)[0];
    const mobileLazy = lazyDistributorKey(MOBILE_MINT)[0];
    const hntLazy = lazyDistributorKey(HNT_MINT)[0];

    const iotRecipient = recipientKey(iotLazy, keyToAsset!.asset);
    const mobileRecipient = recipientKey(mobileLazy, keyToAsset!.asset);
    const hntRecipient = recipientKey(hntLazy, keyToAsset!.asset);

    console.log("Iot Recipient", iotRecipient, await lazyProgram.account.recipientV0.fetchNullable(iotRecipient[0]));
    console.log("Mobile Recipient", mobileRecipient, await lazyProgram.account.recipientV0.fetchNullable(mobileRecipient[0]));
    console.log("Hnt Recipient", hntRecipient, await lazyProgram.account.recipientV0.fetchNullable(hntRecipient[0]));
  }
}
