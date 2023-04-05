import * as anchor from "@coral-xyz/anchor";
import { init } from "@helium/helium-entity-manager-sdk";
import { daoKey } from "@helium/helium-sub-daos-sdk";
import { createMintInstructions } from "@helium/spl-utils";
import { PublicKey, Keypair } from "@solana/web3.js";
import Squads from "@sqds/sdk";
import { BN } from "bn.js";
import os from "os";
import yargs from "yargs/yargs";
import { sendInstructionsOrSquads } from "./utils";

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
    hntMint: {
      type: "string",
      required: true,
      describe: "Mint address of hnt",
    },
    recipient: {
      type: "string",
      required: true,
      describe: "Recipient wallet address for the iot ops fund nft",
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
  const hemProgram = await init(provider);

  const mint = Keypair.generate()
  const hnt = new PublicKey(argv.hntMint)
  const [dao] = daoKey(hnt);
  const instructions = [];
  instructions.push(
    await hemProgram.methods
      .issueIotOperationsFundV0()
      .preInstructions(
        await createMintInstructions(provider, 0, dao, dao, mint)
      )
      .accounts({
        dao,
        recipient: new PublicKey(argv.recipient),
        mint: mint.publicKey,
      })
      .signers([mint])
  );

  const squads = Squads.endpoint(
    process.env.ANCHOR_PROVIDER_URL,
    provider.wallet
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
