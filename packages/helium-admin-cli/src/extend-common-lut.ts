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
    // HNT lazy distributor
    // "6gcZXjHgKUBMedc2V1aZLFPwh8M1rPVRw7kpo2KqNrFq",
    // HNT Circuit Breaker
    // "73zsmmqCXjvHHhNSib26Y8p3jYiH3UUuyKv71RJDnctW",
    // HNT Rewards pool
    // "BDs6RPnpJNzmuMNv1z8cDh9cxKFgCxEVDaCfoHZWyvqJ",
    // TaskQueueAuthorityV0 for welcome-pack
    "9hLWFGiit1ZpFHmopyacWqiVx8sQX9U86dnKqtDjkjnL",
    // Queue authority for welcome-pack
    "3HTSCuJGL8e5zPpf7rMhq42YgA7f3WdF5bm78YQ3HEBK"
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
