import * as anchor from "@anchor-lang/core";
import {
  PublicKey,
  SystemProgram,
  TransactionInstruction,
} from "@solana/web3.js";
import os from "os";
import yargs from "yargs/yargs";
import { sendInstructionsOrSquadsV4 } from "./utils";

const BPF_LOADER_UPGRADEABLE = new PublicKey(
  "BPFLoaderUpgradeab1e11111111111111111111111",
);
// Index in UpgradeableLoaderInstruction.
const EXTEND_PROGRAM = 6;

export async function run(args: any = process.argv) {
  const yarg = yargs(args).options({
    wallet: {
      alias: "k",
      describe: "Anchor wallet keypair. It pays the rent of the added bytes",
      default: `${os.homedir()}/.config/solana/id.json`,
    },
    url: {
      alias: "u",
      default: "http://127.0.0.1:8899",
      describe: "The solana url",
    },
    programId: {
      type: "string",
      describe: "Program to extend",
      required: true,
    },
    bytes: {
      type: "number",
      describe: "Bytes to add. The loader takes no less than 10240",
      default: 10240,
    },
  });
  const argv = await yarg.argv;
  process.env.ANCHOR_WALLET = argv.wallet;
  process.env.ANCHOR_PROVIDER_URL = argv.url;
  anchor.setProvider(anchor.AnchorProvider.local(argv.url));
  const provider = anchor.getProvider() as anchor.AnchorProvider;
  const programId = new PublicKey(argv.programId);
  const payer = provider.wallet.publicKey;

  const [programData] = PublicKey.findProgramAddressSync(
    [programId.toBuffer()],
    BPF_LOADER_UPGRADEABLE,
  );
  if (!(await provider.connection.getAccountInfo(programData))) {
    throw new Error(`No program data account for ${programId.toBase58()}`);
  }

  const data = Buffer.alloc(8);
  data.writeUInt32LE(EXTEND_PROGRAM, 0);
  data.writeUInt32LE(argv.bytes, 4);

  console.log(
    `Extending ${programId.toBase58()} by ${
      argv.bytes
    } bytes, payer ${payer.toBase58()}`,
  );

  // ExtendProgram needs no authority, and the runtime rejects it through a
  // CPI, so a multisig cannot send it. The wallet sends it directly.
  await sendInstructionsOrSquadsV4({
    provider,
    instructions: [
      new TransactionInstruction({
        programId: BPF_LOADER_UPGRADEABLE,
        keys: [
          { pubkey: programData, isSigner: false, isWritable: true },
          { pubkey: programId, isSigner: false, isWritable: true },
          {
            pubkey: SystemProgram.programId,
            isSigner: false,
            isWritable: false,
          },
          { pubkey: payer, isSigner: true, isWritable: true },
        ],
        data,
      }),
    ],
    signers: [],
  });
}
