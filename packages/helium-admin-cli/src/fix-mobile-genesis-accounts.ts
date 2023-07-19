import * as anchor from "@coral-xyz/anchor";
import yargs from "yargs/yargs";
import { PublicKey } from "@solana/web3.js";
import fs from "fs";
import os from "os";
import { init, keyToAssetKey, mobileInfoKey, rewardableEntityConfigKey } from "@helium/helium-entity-manager-sdk";
import { daoKey } from "@helium/helium-sub-daos-sdk";
import { HNT_MINT } from "@helium/spl-utils";
import { bs58 } from "@coral-xyz/anchor/dist/cjs/utils/bytes";

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

  const hemProgram = await init(provider);

  const rawAccs = await provider.connection.getProgramAccounts(hemProgram.programId, {
    filters: [{
      dataSize: 113,
    }]
  });


  for (const acc of rawAccs) {
    if (acc.account.data.toString("hex").slice(0, 8) != "79c874d129f1e4b8") {
      // this account has a bad discriminator, needs to be fixed
      await hemProgram.methods.fixMobileGenesisAccountsV0().accounts({
        brokenAccount: acc.pubkey,
      }).rpc({ skipPreflight: true })
    }
  }

}