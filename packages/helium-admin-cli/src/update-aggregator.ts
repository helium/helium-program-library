import * as anchor from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import Squads from "@sqds/sdk";
import { AggregatorAccount, SwitchboardProgram } from "@switchboard-xyz/solana.js";
import { aggregatorSetConfig } from "@switchboard-xyz/solana.js/lib/cjs/generated";
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
    executeTransaction: {
      type: "boolean",
    },
    aggregatorKeypair: {
      type: "string",
      describe: "Keypair of the aggregtor",
    },
    switchboardNetwork: {
      type: "string",
      describe: "The switchboard network",
      default: "mainnet-beta",
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
  console.log(argv.url);
  process.env.ANCHOR_WALLET = argv.wallet;
  process.env.ANCHOR_PROVIDER_URL = argv.url;
  anchor.setProvider(anchor.AnchorProvider.local(argv.url));

  const provider = anchor.getProvider() as anchor.AnchorProvider;

  const wallet = loadKeypair(argv.wallet);
  const aggKeypair = await loadKeypair(argv.aggregatorKeypair!);

  const switchboard = await SwitchboardProgram.load(
    "mainnet-beta",
    provider.connection,
    wallet
  );

  const squads = Squads.endpoint(
    process.env.ANCHOR_PROVIDER_URL,
    provider.wallet,
    {
      commitmentOrConfig: "finalized",
    }
  );
  let authority = provider.wallet.publicKey;

  let multisig = argv.multisig ? new PublicKey(argv.multisig) : null;
  if (multisig) {
    authority = squads.getAuthorityPDA(multisig, argv.authorityIndex);
  }
  const [aggregator] = await AggregatorAccount.load(
    switchboard,
    aggKeypair.publicKey
  )
  const ix = await aggregator.setConfigInstruction(authority, {
    batchSize: 6,
    minOracleResults: 5
  });

  await sendInstructionsOrSquads({
    provider,
    instructions: ix.ixns,
    executeTransaction: argv.executeTransaction,
    squads,
    multisig: argv.multisig ? new PublicKey(argv.multisig) : undefined,
    authorityIndex: argv.authorityIndex,
    signers: [],
  });
}
