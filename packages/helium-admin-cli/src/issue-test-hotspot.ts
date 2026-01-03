import * as anchor from "@coral-xyz/anchor";
import {
  init as initHem,
  iotInfoKey,
  keyToAssetKey,
  mobileInfoKey,
  rewardableEntityConfigKey,
} from "@helium/helium-entity-manager-sdk";
import { daoKey, subDaoKey } from "@helium/helium-sub-daos-sdk";
import { getAsset, getAssetProof, HNT_MINT, IOT_MINT, MOBILE_MINT, proofArgsAndAccounts } from "@helium/spl-utils";
import { PublicKey } from "@solana/web3.js";
import os from "os";
import yargs from "yargs/yargs";
import { exists } from "./utils";
import { Keypair as HeliumKeypair } from "@helium/crypto";
import bs58 from "bs58";
import { loadKeypair } from "./utils";
import { getLeafAssetId, TreeAuthorityIncorrectError } from "@metaplex-foundation/mpl-bubblegum";
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
    testEccVerifierKeypair: {
      type: "string",
    },
    testRewardsOracleFaucet: {
      type: "string",
      default: "https://iot-rewards-faucet.oracle.test-helium.com"
    }
  });

  const argv = await yarg.argv;
  process.env.ANCHOR_WALLET = argv.wallet;
  process.env.ANCHOR_PROVIDER_URL = argv.url;
  anchor.setProvider(anchor.AnchorProvider.local(argv.url));

  const provider = anchor.getProvider() as anchor.AnchorProvider;
  const hemProgram = await initHem(provider);
  const eccVerifier = loadKeypair(argv.testEccVerifierKeypair!);
  const ecc = (await HeliumKeypair.makeRandom()).address.b58;
  
  console.log(ecc);
  // uncomment when data only hotspots are supported
  // const method = await hemProgram.methods.issueDataOnlyEntityV0({
  //   entityKey: Buffer.from(bs58.decode(ecc)),
  // }).accountsPartial({
  //   recipient: provider.wallet.publicKey,
  //   dao: daoKey(HNT_MINT)[0],
  //   eccVerifier: eccVerifier.publicKey,
  // })
  // .signers([eccVerifier]);
  
  // const { keyToAsset } = await method.pubkeys();
  // await method.rpc({skipPreflight: true});

  // const kta = await hemProgram.account.keyToAssetV0.fetch(keyToAsset);
  // const {
  //   args: proofArgs,
  //   remainingAccounts,
  // } = await proofArgsAndAccounts({
  //   connection: hemProgram.provider.connection,
  //   assetId: kta.asset,
  // });


  // const rewardableEntityConfig = rewardableEntityConfigKey(subDaoKey(IOT_MINT)[0], "IOT")[0];
  // await hemProgram.methods.onboardDataOnlyIotHotspotV0({
  //     ...proofArgs,
  //     location: null,
  //     elevation: null,
  //     gain: null,
  // }).accountsPartial({
  //   rewardableEntityConfig,
  //   hotspotOwner: provider.wallet.publicKey,
  //   keyToAsset,
  //   iotInfo: iotInfoKey(rewardableEntityConfig, ecc)[0],
  //   subDao: subDaoKey(IOT_MINT)[0],
  // }).remainingAccounts(remainingAccounts).rpc();

  // await axios.get(`${argv.testRewardsOracleFaucet}/rewards/${ecc}?amount=5`);
}