import * as anchor from "@coral-xyz/anchor";
import {
  init as initPrice,
} from "@helium/price-oracle-sdk"
import { PublicKey } from "@solana/web3.js";
import os from "os";
import yargs from "yargs/yargs";
import { loadKeypair, sendInstructionsOrSquadsV4 } from "./utils";

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
    oracle: {
      required: true,
      describe: "Public Key of the oracle",
      type: "string",
    },
    multisig: {
      type: "string",
      describe:
        "Address of the squads multisig to be authority. If not provided, your wallet will be the authority",
    },
    oracles: {
      type: "array",
      describe: 'public keys of the oracles',
      required: true
    }
  });
  const argv = await yarg.argv;
  process.env.ANCHOR_WALLET = argv.wallet;
  process.env.ANCHOR_PROVIDER_URL = argv.url;
  anchor.setProvider(anchor.AnchorProvider.local(argv.url));
  const provider = anchor.getProvider() as anchor.AnchorProvider;
  const wallet = new anchor.Wallet(loadKeypair(argv.wallet));
  const program = await initPrice(provider);
  const oracleKey = new PublicKey(argv.oracle)
  const oracle = await program.account.priceOracleV0.fetch(oracleKey)

  const ix = await program.methods
    .updatePriceOracleV0({
      oracles: argv.oracles.map(o => ({
        authority: new PublicKey(o),
        lastSubmittedPrice: null,
        lastSubmittedTimestamp: null,
      })),
      authority: null
    })
    .accountsPartial({
      priceOracle: oracleKey,
      authority: oracle.authority
    })
    .instruction();

  await sendInstructionsOrSquadsV4({
    provider,
    instructions: [ix],
    multisig: argv.multisig ? new PublicKey(argv.multisig) : undefined,
    signers: [],
  });
}
