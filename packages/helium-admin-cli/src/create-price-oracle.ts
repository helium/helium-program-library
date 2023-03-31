import {
  init,
} from "@helium/price-oracle-sdk";
import * as anchor from "@coral-xyz/anchor";
import {
  Connection,
  Keypair,
  PublicKey,
} from "@solana/web3.js";
import os from "os";
import yargs from "yargs/yargs";
import {
  loadKeypair,
} from "./utils";
import Squads from "@sqds/sdk";
import fs from "fs";
import { heliumAddressToSolPublicKey } from "@helium/spl-utils";

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
    priceOracleKeypair: {
      type: "string",
      required: false,
      describe: "Keypair of the price oracle account",
      default: null,
    },
    oracles: {
      type: "string",
      required: true,
      describe: `JSON file of helium keypairs of the oracles`,
    },
    decimals: {
      type: "number",
      required: true,
      describe: "Number of decimals in the price",
    },
    multisig: {
      type: "string",
      describe:
        "Address of the squads multisig to control the dao. If not provided, your wallet will be the authority",
    },
    authorityIndex: {
      type: "number",
      describe: "Authority index for squads. Defaults to 1",
      default: 1,
    },
  });

  const argv = await yarg.argv;
  process.env.ANCHOR_WALLET = argv.wallet;
  process.env.ANCHOR_PROVIDER_URL = argv.url;
  anchor.setProvider(anchor.AnchorProvider.local(argv.url));

  const provider = anchor.getProvider() as anchor.AnchorProvider;
  const program = await init(provider);

  const squads = Squads.endpoint(
    process.env.ANCHOR_PROVIDER_URL,
    provider.wallet
  );
  let authority = provider.wallet.publicKey;
  let multisig = argv.multisig ? new PublicKey(argv.multisig) : null;
  if (multisig) {
    authority = squads.getAuthorityPDA(multisig, argv.authorityIndex);
  }

  const priceOracleKeypair = argv.priceOracleKeypair ? await loadKeypair(argv.priceOracleKeypair) : Keypair.generate();
  const oracleKeys = JSON.parse(fs.readFileSync(argv.oracles).toString()).map(
    (hKey) => heliumAddressToSolPublicKey(hKey)
  );
  const oracles = oracleKeys.map((x: PublicKey) => {
    return {
      authority: x,
      lastSubmittedPrice: null,
      lastSubmittedTimestamp: null,
    }
  })
  await program.methods.initializePriceOracleV0({
    oracles,
    decimals: argv.decimals,
    authority
  }).accounts({
    priceOracle: priceOracleKeypair.publicKey,
    payer: provider.wallet.publicKey,
  }).signers([priceOracleKeypair])
  .rpc({skipPreflight: true});

  console.log(`Created price oracle at: ${priceOracleKeypair.publicKey}`);
}
