import * as anchor from "@coral-xyz/anchor";
import {
  daoKey,
  init as initDao,
  subDaoKey,
} from "@helium/helium-sub-daos-sdk";
import { init as initVsr } from "@helium/voter-stake-registry-sdk";
import { PublicKey } from "@solana/web3.js";
import Squads from "@sqds/sdk";
import os from "os";
import yargs from "yargs/yargs";
import {
  getTimestampFromDays,
  getUnixTimestamp,
  sendInstructionsOrSquads,
} from "./utils";

const SECS_PER_DAY = 86400;
const SECS_PER_YEAR = 365 * SECS_PER_DAY;
const MAX_LOCKUP = 4 * SECS_PER_YEAR;

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
      describe:
        "Mint of the HNT token. Only used if --resetDaoVotingMint flag is set",
    },
    dntMint: {
      type: "string",
      describe:
        "Mint of the subdao token. Only used if --resetSubDaoVotingMint flag is set",
    },
    resetDaoVotingMint: {
      type: "boolean",
      describe: "Reset the dao voting mint",
      default: false,
    },
    resetSubDaoVotingMint: {
      type: "boolean",
      describe: "Reset the subdao voting mint",
      default: false,
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

  if (argv.resetSubDaoVotingMint && !argv.dntMint) {
    console.log("dnt mint not provided");
    return;
  }

  const provider = anchor.getProvider() as anchor.AnchorProvider;
  const hsdProgram = await initDao(provider);
  const hvsrProgram = await initVsr(provider);
  const now = Number(await getUnixTimestamp(provider));
  const in7Days = now + getTimestampFromDays(7);
  const instructions = [];

  const squads = Squads.endpoint(
    process.env.ANCHOR_PROVIDER_URL,
    provider.wallet, {
      commitmentOrConfig: "finalized"
    }
  );

  if (argv.resetDaoVotingMint) {
    console.log("resetting dao votingMint");
    const hntMint = new PublicKey(argv.hntMint);
    const dao = daoKey(hntMint)[0];
    const daoAcc = await hsdProgram.account.daoV0.fetch(dao);

    instructions.push(
      await hvsrProgram.methods
        .configureVotingMintV0({
          idx: 0,
          digitShift: 0,
          baselineVoteWeightScaledFactor: new anchor.BN(0 * 1e9),
          maxExtraLockupVoteWeightScaledFactor: new anchor.BN(100 * 1e9),
          lockupSaturationSecs: new anchor.BN(MAX_LOCKUP),
          genesisVotePowerMultiplier: 3,
          genesisVotePowerMultiplierExpirationTs: new anchor.BN(in7Days),
        })
        .accounts({
          registrar: daoAcc.registrar,
          realmAuthority: daoAcc.authority,
          mint: hntMint,
        })
        .remainingAccounts([
          {
            pubkey: hntMint,
            isSigner: false,
            isWritable: false,
          },
        ])
        .instruction()
    );
  }

  if (argv.resetSubDaoVotingMint) {
    console.log("resetting subdao votingMint");
    const dntMint = new PublicKey(argv.dntMint);
    const subDao = subDaoKey(dntMint)[0];
    const subdaoAcc = await hsdProgram.account.subDaoV0.fetch(subDao);

    instructions.push(
      await hvsrProgram.methods
        .configureVotingMintV0({
          idx: 0,
          digitShift: -1,
          baselineVoteWeightScaledFactor: new anchor.BN(0 * 1e9),
          maxExtraLockupVoteWeightScaledFactor: new anchor.BN(100 * 1e9),
          lockupSaturationSecs: new anchor.BN(MAX_LOCKUP),
          genesisVotePowerMultiplier: 1,
          genesisVotePowerMultiplierExpirationTs: new anchor.BN(now),
        })
        .accounts({
          registrar: subdaoAcc.registrar,
          mint: dntMint,
          realmAuthority: subdaoAcc.authority,
        })
        .remainingAccounts([
          {
            pubkey: dntMint,
            isSigner: false,
            isWritable: false,
          },
        ])
        .instruction()
    );
  }

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
