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
    // Mobile sponsored price oracle
    "DQ4C1tzvu28cwo1roN1Wm6TW35sfJEjLh517k3ZeWevx",
    // HNT sponsored price oracle
    "4DdmDswskDxXGpwHrXUfn2CNUm9rt21ac79GHNTN3J33",
    // IOT Registrar
    "7ZZopN1mx6ECcb3YCG8dbxeLpA44xq4gzA1ETEiaLoeL",
    // IOT Proposal Config
    "7cvYwyj6k4NEPNoaCTUufDdGJqqB6ZBRf4t3TrSSUGrc",
    // State controller program
    "stcfiqW3fwD9QCd8Bqr1NBLrs7dftZHBQe7RiMMA4aM",
    // Proposal program
    "propFYxqmVcufMhk5esNMrexq2ogHbbC2kP9PU1qxKs",
    // MOBILE Registrar
    "C4DWaps9bLiqy4e81wJ7VTQ6QR7C4MWvwsei3ZjsaDuW",
    // MOBILE Proposal Config
    "5c9JxRCj4CwhZwaUyjvpb4JJbKW7xpvEFq3Rb2upkytc",
  ].map((a) => {
    return new PublicKey(a);
  });

  const slot = await provider.connection.getSlot();
  const lookupTableAddress = new PublicKey(argv.lookupTable);
  const lookupTableInst = AddressLookupTableAccount.deserialize(
    (await provider.connection.getAccountInfo(lookupTableAddress))!.data
  );
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
