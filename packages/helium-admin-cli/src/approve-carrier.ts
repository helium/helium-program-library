  
import * as anchor from "@coral-xyz/anchor";
import { carrierKey, init as initMem } from "@helium/mobile-entity-manager-sdk";
import { subDaoKey, init as initHsd } from "@helium/helium-sub-daos-sdk";
import { PublicKey, TransactionInstruction } from "@solana/web3.js";
import Squads from "@sqds/sdk";
import os from "os";
import yargs from "yargs/yargs";
import { sendInstructionsOrSquads } from "./utils";
import { MOBILE_MINT } from "@helium/spl-utils";

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
    dntMint: {
      type: "string",
      describe: "DNT mint of the subdao to approve on",
      default: MOBILE_MINT.toBase58(),
    },
    name: {
      alias: "n",
      type: "string",
      required: true,
      describe: "Name of the carrier to approve, case sensitive",
    },
    executeTransaction: {
      type: "boolean",
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
  });
  const argv = await yarg.argv;
  process.env.ANCHOR_WALLET = argv.wallet;
  process.env.ANCHOR_PROVIDER_URL = argv.url;
  anchor.setProvider(anchor.AnchorProvider.local(argv.url));
  const provider = anchor.getProvider() as anchor.AnchorProvider;
  const program = await initMem(provider);
  const hsdProgram = await initHsd(provider);

  const instructions: TransactionInstruction[] = [];

  const dntMint = new PublicKey(argv.dntMint);
  const subDao = subDaoKey(dntMint)[0];
  const authority = (await hsdProgram.account.subDaoV0.fetch(subDao)).authority;
  const carrier = carrierKey(subDao, argv.name)[0];

  instructions.push(
    await program.methods
      .approveCarrierV0()
      .accounts({
        carrier,
        authority,
      })
      .instruction()
  );

  const squads = Squads.endpoint(
    process.env.ANCHOR_PROVIDER_URL,
    provider.wallet,
    {
      commitmentOrConfig: "finalized",
    }
  );

  await sendInstructionsOrSquads({
    provider,
    instructions,
    executeTransaction: argv.executeTransaction,
    squads,
    multisig: argv.multisig ? new PublicKey(argv.multisig) : undefined,
    authorityIndex: argv.authorityIndex,
    signers: [],
  });
}
