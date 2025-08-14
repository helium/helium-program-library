import { init as initDc, mintDataCredits } from "@helium/data-credits-sdk";
import { toBN, DC_MINT, sendInstructions } from "@helium/spl-utils";
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
      default: DC_MINT.toString(),
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
    },
  });

  const argv = await yarg.argv;
  process.env.ANCHOR_WALLET = argv.wallet;
  process.env.ANCHOR_PROVIDER_URL = argv.url;
  anchor.setProvider(anchor.AnchorProvider.local(argv.url));

  const provider = anchor.getProvider() as anchor.AnchorProvider;
  const dataCreditsProgram = await initDc(provider);


  const dcKey = new PublicKey(argv.dcKey);
  const destination = new PublicKey(argv.destination || provider.wallet.publicKey.toString());
  const destAta = await getAssociatedTokenAddress(dcKey, destination)
  let preBalance = 0
  try {
    preBalance = (
      await provider.connection.getTokenAccountBalance(destAta, "confirmed")
    ).value.uiAmount!;
  } catch (e: any) {
    if (!e.toString().includes("Invalid param: could not find account")) {
      throw e;
    }
  }

  await sendInstructions(provider, [
    await createAssociatedTokenAccountIdempotentInstruction(
      provider.wallet.publicKey,
      getAssociatedTokenAddressSync(dcKey, destination, true),
      destination,
      dcKey
    )
  ])
  const {txs} = await mintDataCredits({
    program: dataCreditsProgram,
    hntAmount: toBN(argv.numHnt, 8),
    dcMint: dcKey,
    recipient: destination,
  })

  await provider.sendAll(txs)
  
  const postBalance = (
    await provider.connection.getTokenAccountBalance(destAta, "confirmed")
  ).value.uiAmount;

  console.log(`Burned ${argv.numHnt} HNT to mint ${postBalance! - preBalance} DC`);
}
