import * as anchor from "@coral-xyz/anchor";
import {
  init as initCb,
  mintWindowedBreakerKey,
} from "@helium/circuit-breaker-sdk";
import { daoKey, delegatorRewardsPercent, init as initHsd } from "@helium/helium-sub-daos-sdk";
import { PublicKey, TransactionInstruction } from "@solana/web3.js";
import os from "os";
import yargs from "yargs/yargs";
import {
  loadKeypair,
  parseEmissionsSchedule,
  sendInstructionsOrSquadsV4,
} from "./utils";
import { organizationKey } from "@helium/organization-sdk";

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
      required: true,
      type: "string",
      describe: "HNT mint of the dao to be updated",
    },
    newAuthority: {
      required: false,
      describe: "New DAO authority",
      type: "string",
      default: null,
    },
    newEmissionsSchedulePath: {
      required: false,
      describe: "Path to file that contains the new emissions schedule",
      type: "string",
      default: null,
    },
    newHstEmissionsSchedulePath: {
      required: false,
      describe: "Path to file that contains the new HST emissions schedule",
      type: "string",
      default: null,
    },
    newNetEmissionsCap: {
      required: false,
      describe: "New net emissions cap, without decimals",
      type: "string",
      default: null,
    },
    delegatorRewardsPercent: {
      type: "number",
      describe:
        "Percentage of rewards allocated to delegators. Must be between 0-100 and can have 8 decimal places.",
    },
    newHstPool: {
      required: false,
      describe: "New HST Pool",
      type: "string",
      default: null,
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
  const wallet = new anchor.Wallet(loadKeypair(argv.wallet));
  const program = await initHsd(provider);
  const cbProgram = await initCb(provider);

  const instructions: TransactionInstruction[] = [];

  const hntMint = new PublicKey(argv.hntMint);
  const dao = daoKey(hntMint)[0];
  const daoAcc = await program.account.daoV0.fetch(dao);
  if (argv.newAuthority) {
    const hntCircuitBreaker = mintWindowedBreakerKey(hntMint)[0];
    const hntCbAcc = await cbProgram.account.mintWindowedCircuitBreakerV0.fetch(
      hntCircuitBreaker
    );
    instructions.push(
      await cbProgram.methods
        .updateMintWindowedBreakerV0({
          newAuthority: new PublicKey(argv.newAuthority),
          config: null,
        })
        .accountsPartial({
          circuitBreaker: hntCircuitBreaker,
          authority: hntCbAcc.authority,
        })
        .instruction()
    );
  }
  instructions.push(
    await program.methods
      .updateDaoV0({
        authority: argv.newAuthority ? new PublicKey(argv.newAuthority) : null,
        emissionSchedule: argv.newEmissionsSchedulePath
          ? await parseEmissionsSchedule(argv.newEmissionsSchedulePath)
          : null,
        hstEmissionSchedule: argv.newHstEmissionsSchedulePath
          ? await parseEmissionsSchedule(argv.newHstEmissionsSchedulePath)
          : null,
        netEmissionsCap: argv.newNetEmissionsCap
          ? new anchor.BN(argv.newNetEmissionsCap)
          : null,
        hstPool: argv.newHstPool ? new PublicKey(argv.newHstPool) : null,
        proposalNamespace: organizationKey("Helium")[0],
        delegatorRewardsPercent: argv.delegatorRewardsPercent
          ? delegatorRewardsPercent(argv.delegatorRewardsPercent)
          : null,
        rewardsEscrow: null,  
      })
      .accountsPartial({
        dao,
        authority: daoAcc.authority,
        payer: daoAcc.authority,
      })
      .instruction()
  );

  await sendInstructionsOrSquadsV4({
    provider,
    instructions,
    multisig: argv.multisig ? new PublicKey(argv.multisig) : undefined,
    signers: [],
  });
}
