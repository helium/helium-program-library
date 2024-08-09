import * as anchor from "@coral-xyz/anchor";
import {
  HELIUM_COMMON_LUT,
  chunks,
  truthy,
  withPriorityFees,
} from "@helium/spl-utils";
import {
  AddressLookupTableAccount,
  AddressLookupTableProgram,
  PublicKey,
} from "@solana/web3.js";
import Squads from "@sqds/sdk";
import os from "os";
import yargs from "yargs/yargs";
import { loadKeypair, sendInstructionsOrSquads } from "./utils";

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
    multisig: {
      type: "string",
      describe:
        "Address of the squads multisig to be authority. If not provided, your wallet will be the authority",
    },
    authorityIndex: {
      type: "number",
      describe: "Authority index for squads. Defaults to 1",
      default: 1,
    },
    lookupTable: {
      type: "string",
      describe: "Address of the address lookup table",
      default: HELIUM_COMMON_LUT.toBase58(),
    },
  });
  const argv = await yarg.argv;
  process.env.ANCHOR_WALLET = argv.wallet;
  process.env.ANCHOR_PROVIDER_URL = argv.url;
  anchor.setProvider(anchor.AnchorProvider.local(argv.url));
  const provider = anchor.getProvider() as anchor.AnchorProvider;
  const wallet = new anchor.Wallet(loadKeypair(argv.wallet));
  const squads = Squads.endpoint(process.env.ANCHOR_PROVIDER_URL, wallet, {
    commitmentOrConfig: "finalized",
  });
  let authority = provider.wallet.publicKey;
  let multisig = argv.multisig ? new PublicKey(argv.multisig) : null;
  if (multisig) {
    authority = squads.getAuthorityPDA(multisig, argv.authorityIndex);
  }

  const accounts = [
    // HNT Proposal Config
    "22SWTDZVj1L81SXfwbEeUmdZBFj23MFmER3Gv8BmxbBS",
    // HNT state controller
    "7Vrme34DXPH8ow4HEAatZKwZF9AR5vq8MZhA3CanMEbr",
    // IOT proposal config
    "7cvYwyj6k4NEPNoaCTUufDdGJqqB6ZBRf4t3TrSSUGrc",
    // IOT State controller
    "3eEnmZBiJems6ipPtdQS2UkJYfPqzvnDzhWQuTTN2ou5",
    // IOT Registrar
    "7ZZopN1mx6ECcb3YCG8dbxeLpA44xq4gzA1ETEiaLoeL",
    // State controller program
    "stcfiqW3fwD9QCd8Bqr1NBLrs7dftZHBQe7RiMMA4aM",
    // Mobile proposal config
    "5c9JxRCj4CwhZwaUyjvpb4JJbKW7xpvEFq3Rb2upkytc",
    // Mobile registrar
    "C4DWaps9bLiqy4e81wJ7VTQ6QR7C4MWvwsei3ZjsaDuW",
    // Mobile state controller
    "r11HAkEaPqkFHwDVewcmWSfRrMaLYcBLGquC2RBn3Xp",
  ].map((a) => {
    return new PublicKey(a);
  });

  const lookupTableAddress = new PublicKey(argv.lookupTable);
  for (const addresses of chunks(accounts, 20)) {
    await sendInstructionsOrSquads({
      provider,
      signers: [],
      squads,
      multisig: multisig!,
      authorityIndex: argv.authorityIndex,
      instructions: await withPriorityFees({
        connection: provider.connection,
        computeUnits: 200000,
        instructions: [
          AddressLookupTableProgram.extendLookupTable({
            payer: authority,
            authority,
            lookupTable: lookupTableAddress,
            addresses: addresses,
          }),
        ].filter(truthy),
      }),
    });
  }
  console.log("lookup table address:", lookupTableAddress.toBase58());
}
