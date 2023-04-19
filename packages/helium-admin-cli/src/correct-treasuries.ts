import * as anchor from "@coral-xyz/anchor";
import {
  init as initTreasuryManagement,
} from "@helium/treasury-management-sdk";
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
  });
  const argv = await yarg.argv;
  process.env.ANCHOR_WALLET = argv.wallet;
  process.env.ANCHOR_PROVIDER_URL = argv.url;
  anchor.setProvider(anchor.AnchorProvider.local(argv.url));
  const provider = anchor.getProvider() as anchor.AnchorProvider;
  const program = await initTreasuryManagement(provider);

  const sig = await program.methods
    .correctTreasuriesV0()
    .accounts({
      treasuryManagement: new PublicKey(
        "Aon7sbdvCGuXQJW8BEiDDWzsSvoycTL9v3L1S4GWhxNK"
      ),
      destTreasury: new PublicKey(
        "CpyoYpaEZc8DvmkNWNZWfkQDFvGAvHp5mhtEhwGQhkTk"
      ),
    })
    .rpc({ skipPreflight: true });
  console.log(sig)
}
