import * as anchor from "@coral-xyz/anchor";
import { chunks, truthy, withPriorityFees } from "@helium/spl-utils";
import {
  AddressLookupTableProgram,
  PublicKey
} from "@solana/web3.js";
import * as multisig from '@sqds/multisig';
import os from "os";
import yargs from "yargs/yargs";
import { sendInstructionsOrSquadsV4 } from "./utils";

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
  });
  const argv = await yarg.argv;
  process.env.ANCHOR_WALLET = argv.wallet;
  process.env.ANCHOR_PROVIDER_URL = argv.url;
  anchor.setProvider(anchor.AnchorProvider.local(argv.url));
  const provider = anchor.getProvider() as anchor.AnchorProvider;
  let authority = provider.wallet.publicKey;
  let multisigPda = argv.multisig ? new PublicKey(argv.multisig) : null;
  if (multisigPda) {
    const [vaultPda] = multisig.getVaultPda({
      multisigPda,
      index: 0,
    });
    authority = vaultPda;
  }

  const accounts = [
    "tuktukUrfhXT6ZT77QTU8RQtvgL967uRuVagWF57zVA",
    "2cXtsiYJz5H63BSRTmvz55biX92mQKkxZyH3Vb5bD38o",
    "96kbqKkBEJ3Coa2kbeWy5xVdf8h7ZVhUeaVMHN8J59ex",
    "HMBp68hMkHAr574nmckmS93p2RSZL5N4NMavhmFApwjF",
    "dcauByvWqZMRAhPr7Qoadag4XqVS75JyR5zsvqWPWJS",
    "Dpw1EAVrSB1ibxiDQyTAW6Zip3J4Btk2x4SgApQCeFbX",
    "4DdmDswskDxXGpwHrXUfn2CNUm9rt21ac79GHNTN3J33",
    "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
    "hntyVP6YFm1Hg25TN9WGLqM12b8TQmcknKrdu1oxWux",
    "Dpw1EAVrSB1ibxiDQyTAW6Zip3J4Btk2x4SgApQCeFbX",
    "2JTPq9ZVYTTcGA2drAvyXBAH1kiSazt6t9FmKaRtzPex",
    "H7Z7668Wp2DZrW7VVdRgaNhYx2ECdsNDqqqVsf7K7FVt",
    "GksXKowDkF5869AXSGiWBVRT78TMVmrQJFAiLjmKVBKR",
    "Sysvar1nstructions1111111111111111111111111",
    "11111111111111111111111111111111",
    "tdcam4m5U74pEZQrsQ7fVAav4AUXXc6z8fkhvExfRVN",
    "JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4",
    "whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc"
  ].map((a) => {
    return new PublicKey(a);
  });

  const slot = await provider.connection.getSlot();
  const [lookupTableInst, lookupTableAddress] =
    AddressLookupTableProgram.createLookupTable({
      authority,
      payer: authority,
      recentSlot: slot,
    });
  let isFirst = true;
  for (const addresses of chunks(accounts, 20)) {
    await sendInstructionsOrSquadsV4({
      provider,
      signers: [],
      multisig: multisigPda!,
      instructions: [
        isFirst ? lookupTableInst : undefined,
        AddressLookupTableProgram.extendLookupTable({
          payer: authority,
          authority,
          lookupTable: lookupTableAddress,
          addresses: addresses,
        }),
      ].filter(truthy),
    });
    isFirst = false;
  }
  console.log("lookup table address:", lookupTableAddress.toBase58());
}
