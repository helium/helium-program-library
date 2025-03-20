import * as anchor from "@coral-xyz/anchor";
import { fanoutKey, init } from "@helium/fanout-sdk";
import { getAccount, getAssociatedTokenAddressSync } from "@solana/spl-token";
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
    name: {
      type: "string",
      describe: "Name of the fanout",
      required: true,
    },
    mint: {
      type: "string",
      describe: "Mint to dist",
      required: true,
    },
  });

  const argv = await yarg.argv;
  process.env.ANCHOR_WALLET = argv.wallet;
  process.env.ANCHOR_PROVIDER_URL = argv.url;
  anchor.setProvider(anchor.AnchorProvider.local(argv.url));
  const provider = anchor.getProvider() as anchor.AnchorProvider;

  const hydraProgram = await init(provider);
  const fanoutK = fanoutKey(argv.name)[0];
  const members = (await hydraProgram.account.fanoutVoucherV0.all()).filter(
    (m) => m.account.fanout.equals(fanoutK)
  );

  for (const member of members) {
    const mint = member.account.mint;
    const owners = await provider.connection.getTokenLargestAccounts(mint);
    const owner = (
      await getAccount(provider.connection, owners.value[0].address)
    ).owner;

    console.log("Distributing for mint", mint.toBase58())

    await hydraProgram.methods
      .distributeV0()
      .accountsPartial({
        payer: provider.wallet.publicKey,
        fanout: fanoutK,
        owner,
        mint,
      })
      .rpc({ skipPreflight: true });
  }
}
