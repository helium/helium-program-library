import { init as initDc } from "@helium/data-credits-sdk";
import { toBN } from "@helium/spl-utils";
import * as anchor from "@coral-xyz/anchor";
import { createAssociatedTokenAccountIdempotent, createAssociatedTokenAccountIdempotentInstruction, getAssociatedTokenAddress, getAssociatedTokenAddressSync } from "@solana/spl-token";
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
    dcKey: {
      type: "string",
      describe: "Pubkey of the Data Credit token",
      required: true,
    },
    numHnt: {
      type: "number",
      describe: "Number of HNT tokens to burn",
      default: 1,
    },
    destination: {
      type: "string",
      describe: "The destination wallet for the dc",
      alias: "d",
      required: true,
    },
  });

  const argv = await yarg.argv;
  process.env.ANCHOR_WALLET = argv.wallet;
  process.env.ANCHOR_PROVIDER_URL = argv.url;
  anchor.setProvider(anchor.AnchorProvider.local(argv.url));

  const provider = anchor.getProvider() as anchor.AnchorProvider;
  const dataCreditsProgram = await initDc(provider);


  const dcKey = new PublicKey(argv.dcKey);
  const destination = new PublicKey(argv.destination);
  const destAta = await getAssociatedTokenAddress(dcKey, destination)
  let preBalance = 0
  try {
    preBalance = (
      await provider.connection.getTokenAccountBalance(destAta, "confirmed")
    ).value.uiAmount;
  } catch (e: any) {
    if (!e.toString().includes("Invalid param: could not find account")) {
      throw e;
    }
  }
  
  await dataCreditsProgram.methods
    .mintDataCreditsV0({
      hntAmount: toBN(argv.numHnt, 8),
      dcAmount: null
    })
    .preInstructions([
      await createAssociatedTokenAccountIdempotentInstruction(
        provider.wallet.publicKey,
        getAssociatedTokenAddressSync(dcKey, destination, true),
        destination,
        dcKey
      )
    ])
    .accounts({
      dcMint: dcKey,
      recipient: destination,
    })
    .rpc({ skipPreflight: true });
  const postBalance = (
    await provider.connection.getTokenAccountBalance(destAta, "confirmed")
  ).value.uiAmount;

  console.log(`Burned ${argv.numHnt} HNT to mint ${postBalance - preBalance} DC`);
}
