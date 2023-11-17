import yargs from "yargs/yargs";
import { exists, loadKeypair, sendInstructionsOrSquads } from "./utils";
import os from "os";
import * as anchor from "@coral-xyz/anchor";
import { init } from "@helium/nft-delegation-sdk";
import { init as initVsr } from "@helium/voter-stake-registry-sdk";
import fs from "fs";
import { sendInstructions } from "@helium/spl-utils";
import { PublicKey } from "@solana/web3.js";
import Squads from "@sqds/sdk";

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
    registrar: {
      type: "string",
      required: true,
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
    delegationSeasonsFile: {
      type: "string",
      default: `${__dirname}/../../delegation-seasons.json`,
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

  const delProgram = await init(provider);
  const vsrProgram = await initVsr(provider);
  const registrar = new PublicKey(argv.registrar);

  const delegationSeasonsFile = fs.readFileSync(
    argv.delegationSeasonsFile,
    "utf8"
  );
  const seasons = JSON.parse(delegationSeasonsFile).map(
    (s) => new anchor.BN(Math.floor(Date.parse(s) / 1000))
  );

  const {
    pubkeys: { delegationConfig },
    instruction,
  } = await delProgram.methods
    .initializeDelegationConfigV0({
      // Set max time to 2 years, though seasons should take precedent
      maxDelegationTime: new anchor.BN(24 * 60 * 60 * 365 * 2),
      seasons,
      name: "Helium",
    })
    .accounts({
      authority,
    })
    .prepare();

  if (!(await exists(provider.connection, delegationConfig!))) {
    console.log("Creating delegation config");
    await sendInstructions(provider, [instruction]);
  }

  console.log("Updating registrar to delegation config");
  await sendInstructionsOrSquads({
    provider,
    instructions: [
      await vsrProgram.methods
        .updateRegistrarV0()
        .accounts({
          delegationConfig,
          registrar,
          realmAuthority: authority,
        })
        .instruction(),
    ],
    executeTransaction: false,
    squads,
    multisig: argv.multisig ? new PublicKey(argv.multisig) : undefined,
    authorityIndex: argv.authorityIndex,
    signers: [],
  });
}
