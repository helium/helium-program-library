import * as anchor from "@coral-xyz/anchor";
import {
  init as initHsd,
  subDaoKey
} from "@helium/helium-sub-daos-sdk";
import { PublicKey } from "@solana/web3.js";
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
    dntMint: {
      required: true,
      type: "string",
      describe: "DNT mint of the subdao to be updated",
    },
    name: {
      alias: "n",
      type: "string",
      required: false,
      describe: "The name of the entity config",
    },
    vehntDelegated: {
      type: "string"
    },
    vehntLastCalculatedTs: {
      type: "string"
    },
    vehntFallRate: {
      type: "string"
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
    switchboardNetwork: {
      type: "string",
      describe: "The switchboard network",
      default: "devnet",
    },
    registrar: {
      type: "string",
      required: false,
      describe: "VSR Registrar of subdao",
      default: null,
    },
    delegatorRewardsPercent: {
      type: "number",
      required: false,
      describe:
        "Percentage of rewards allocated to delegators. Must be between 0-100 and can have 8 decimal places.",
      default: null,
    },
  });
  const argv = await yarg.argv;
  process.env.ANCHOR_WALLET = argv.wallet;
  process.env.ANCHOR_PROVIDER_URL = argv.url;
  anchor.setProvider(anchor.AnchorProvider.local(argv.url));
  const provider = anchor.getProvider() as anchor.AnchorProvider;
  const program = await initHsd(provider);

  const instructions = [];

  const subDao = subDaoKey(new PublicKey(argv.dntMint))[0];
  const subDaoAcc = await program.account.subDaoV0.fetch(subDao);
  console.log("Subdao", subDao.toBase58())

  instructions.push(
    await program.methods
      .updateSubDaoVehntV0({
        vehntDelegated: isNull(argv.vehntDelegated)
          ? null
          : new BN(argv.vehntDelegated),
        vehntLastCalculatedTs: isNull(argv.vehntLastCalculatedTs)
          ? null
          : new BN(argv.vehntLastCalculatedTs),
        vehntFallRate: isNull(argv.vehntFallRate)
          ? null
          : new BN(argv.vehntFallRate),
      })
      .accounts({
        subDao,
        authority: subDaoAcc.authority,
      })
      .instruction()
  );

  const squads = Squads.endpoint(
    process.env.ANCHOR_PROVIDER_URL,
    provider.wallet, {
      commitmentOrConfig: "finalized"
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

function isNull(vehntDelegated: string | undefined | null) {
  return vehntDelegated === null || typeof vehntDelegated == "undefined";
}

