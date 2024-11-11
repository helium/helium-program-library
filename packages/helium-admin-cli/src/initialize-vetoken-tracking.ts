import * as anchor from "@coral-xyz/anchor";
import {
  delegatorRewardsPercent,
  init as initHsd,
  subDaoKey,
} from "@helium/helium-sub-daos-sdk";
import { organizationKey } from "@helium/organization-sdk";
import { init as initPvr } from "@helium/position-voting-rewards-sdk";
import { init as initVsr } from "@helium/voter-stake-registry-sdk"
import { PublicKey, TransactionInstruction } from "@solana/web3.js";
import Squads from "@sqds/sdk";
import os from "os";
import yargs from "yargs/yargs";
import BN from "bn.js";
import {
  loadKeypair,
  sendInstructionsOrSquads
} from "./utils";

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
    votingRewardsPercent: {
      type: "number",
      describe: "Voting rewards percent",
      required: true,
    },
    orgName: {
      type: "string",
      describe: "Organization name",
      required: true,
    },
  });
  const argv = await yarg.argv;
  process.env.ANCHOR_WALLET = argv.wallet;
  process.env.ANCHOR_PROVIDER_URL = argv.url;
  anchor.setProvider(anchor.AnchorProvider.local(argv.url));
  const provider = anchor.getProvider() as anchor.AnchorProvider;
  const walletKP = loadKeypair(argv.wallet);
  const wallet = new anchor.Wallet(walletKP);
  const program = await initHsd(provider);
  const pvrProgram = await initPvr(provider);
  const vsrProgram = await initVsr(provider);

  const instructions: TransactionInstruction[] = [];

  const dntMint = new PublicKey(argv.dntMint);
  const subDao = subDaoKey(dntMint)[0];
  const subDaoAcc = await program.account.subDaoV0.fetch(subDao);

  const votingRewardsTiers = [
    {
      numVetokens: new BN(0),
      percent: delegatorRewardsPercent(12.5),
    },
    {
      numVetokens: new BN("35000000000000000"),
      percent: delegatorRewardsPercent(25),
    },
    {
      numVetokens: new BN("50000000000000000"),
      percent: delegatorRewardsPercent(50),
    },
    {
      numVetokens: new BN("75000000000000000"),
      percent: delegatorRewardsPercent(75),
    },
    {
      numVetokens: new BN("100000000000000000"),
      percent: delegatorRewardsPercent(100),
    },
  ];
  let {
    instruction,
    pubkeys: { vetokenTracker },
  } = await pvrProgram.methods
    .initializeVetokenTrackerV0({
      votingRewardsTiers,
    })
    .accounts({
      registrar: subDaoAcc.registrar,
      proposalNamespace: organizationKey(argv.orgName)[0],
      rewardsMint: dntMint,
      payer: wallet.publicKey,
      rewardsAuthority: subDao,
    })
    .prepare();

  if (!await provider.connection.getAccountInfo(vetokenTracker!)) {
    instructions.push(instruction);
  } else {
    instructions.push(
      await pvrProgram.methods
        .updateVetokenTrackerV0({
          votingRewardsTiers,
        })
        .accounts({
          vetokenTracker: vetokenTracker!,
          realmAuthority: subDaoAcc.authority,
        })
        .instruction()
    );
  }

  instructions.push(
    await program.methods
      .updateSubDaoV0({
        vetokenTracker: vetokenTracker!,
        votingRewardsPercent: delegatorRewardsPercent(argv.votingRewardsPercent),
        authority: null,
        emissionSchedule: null,
        dcBurnAuthority: null,
        onboardingDcFee: null,
        onboardingDataOnlyDcFee: null,
        registrar: null,
        delegatorRewardsPercent: null,
        activeDeviceAuthority: null,
        rewardsEscrow: null,
      })
      .accounts({
        subDao,
        authority: subDaoAcc.authority,
        payer: subDaoAcc.authority,
      })
      .instruction()
  );

  const registrarK = subDaoAcc.registrar
  const registrar = await vsrProgram.account.registrar.fetch(registrarK)
  if (
    !registrar.positionFreezeAuthorities.some((f) => f.equals(vetokenTracker!))
  ) {
    instructions.push(
      await vsrProgram.methods
        .updateRegistrarV0({
          positionFreezeAuthorities: [
            ...registrar.positionFreezeAuthorities,
            vetokenTracker!,
          ],
          positionUpdateAuthority: registrar.positionUpdateAuthority,
        })
        .accounts({
          registrar: registrarK,
          proxyConfig: registrar.proxyConfig,
        })
        .instruction()
    );
  }

  const squads = Squads.endpoint(process.env.ANCHOR_PROVIDER_URL, wallet, {
    commitmentOrConfig: "finalized",
  });
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
