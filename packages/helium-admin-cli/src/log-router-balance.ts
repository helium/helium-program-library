import * as anchor from "@coral-xyz/anchor";
import {
  delegatedDataCreditsKey,
  init,
} from "@helium/data-credits-sdk";
import { subDaoKey } from "@helium/helium-sub-daos-sdk";
import { DC_MINT } from "@helium/spl-utils";
import { getAccount } from "@solana/spl-token";
import { PublicKey } from "@solana/web3.js";
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
    routerKey: {
      alias: "r",
      type: "string",
      required: true,
      describe: "Router key",
    },
    dntMint: {
      alias: "m",
      type: "string",
      describe: "Mint id of the subdao DNT token",
      required: true,
    },
  });
  const argv = await yarg.argv;
  process.env.ANCHOR_WALLET = argv.wallet;
  process.env.ANCHOR_PROVIDER_URL = argv.url;
  anchor.setProvider(anchor.AnchorProvider.local(argv.url));

  const provider = anchor.getProvider() as anchor.AnchorProvider;
  const dcProgram = await init(provider);
  const dntMint = new PublicKey(argv.dntMint);
  const [subdao] = subDaoKey(dntMint)

  const [delegatedDataCreditsK] = delegatedDataCreditsKey(subdao, argv.routerKey);
  console.log("Delegated data credits key: ", delegatedDataCreditsK.toBase58())
  const delegatedDataCredits = await dcProgram.account.delegatedDataCreditsV0.fetch(delegatedDataCreditsK);
  console.log(delegatedDataCredits)
  const account = await getAccount(provider.connection, delegatedDataCredits.escrowAccount);
  console.log("Balance: ", account.amount.toString());
}
