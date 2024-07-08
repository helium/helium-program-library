import * as anchor from "@coral-xyz/anchor";
import { init as initNftProxy, proxyConfigKey } from "@helium/nft-proxy-sdk";
import { HNT_MINT, createMintInstructions, sendInstructions } from "@helium/spl-utils";
import { getRegistrarKey, init as initVsr, positionKey } from "@helium/voter-stake-registry-sdk";
import { Keypair, PublicKey, TransactionInstruction } from "@solana/web3.js";
import os from "os";
import yargs from "yargs/yargs";
import { loadKeypair } from "./utils";

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
  const wallet = new anchor.Wallet(loadKeypair(argv.wallet));
  const vsrProgram = await initVsr(provider);
  const nftProxyProgram = await initNftProxy(provider);

  const TOTAL_POS = 500;
  let index = 0;
  for (const i of new Array(TOTAL_POS).fill(0)) {
    const mintKeypair = Keypair.generate();
    const position = positionKey(mintKeypair.publicKey)[0];
    const instructions: TransactionInstruction[] = [];
    const kind = { cliff: {} }
    instructions.push(
      ...(await createMintInstructions(
        provider,
        0,
        position,
        position,
        mintKeypair
      ))
    );
    const {
      pubkeys: { positionTokenAccount },
      instruction: initPos,
    } = await vsrProgram.methods
      .initializePositionV0({
        kind,
        periods: 30,
      })
      .accounts({
        // lock for 6 months
        registrar: getRegistrarKey(HNT_MINT),
        mint: mintKeypair.publicKey,
        depositMint: HNT_MINT,
        recipient: wallet.publicKey,
      })
      .prepare();
    instructions.push(initPos);

    // deposit some hnt
    instructions.push(
      await vsrProgram.methods
        .depositV0({ amount: new anchor.BN(10000) })
        .accounts({
          registrar: getRegistrarKey(HNT_MINT),
          position,
          mint: HNT_MINT,
        })
        .instruction()
    );
    instructions.push(
      await nftProxyProgram.methods
        .assignProxyV0({
          expirationTime: new anchor.BN(new Date().valueOf() / 1000 + 10000),
        })
        .accounts({
          proxyConfig: proxyConfigKey("Helium V1")[0],
          asset: mintKeypair.publicKey,
          recipient: new PublicKey(
            "exmrL4U6vk6VFoh3Q7fkrPbjpNLHPYFf1J8bqGypuiK"
          ),
          tokenAccount: positionTokenAccount,
          voter: PublicKey.default
        })
        .instruction()
    );
    await sendInstructions(provider, instructions, [mintKeypair]);
    index++;
    console.log(`Sent ${index}/${TOTAL_POS}`);
  }
}
