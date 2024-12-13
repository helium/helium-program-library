import * as anchor from "@coral-xyz/anchor";
import { ThresholdType } from "@helium/circuit-breaker-sdk";
import {
  daoKey,
  delegatorRewardsPercent,
  init as initHsd
} from "@helium/helium-sub-daos-sdk";
import { init as initLazy, lazyDistributorKey } from "@helium/lazy-distributor-sdk";
import { organizationKey } from "@helium/organization-sdk";
import { oracleSignerKey } from "@helium/rewards-oracle-sdk";
import {
  batchParallelInstructionsWithPriorityFee,
  HNT_MINT,
  IOT_MINT,
  MOBILE_MINT,
} from "@helium/spl-utils";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";
import { PublicKey, TransactionInstruction } from "@solana/web3.js";
import Squads from "@sqds/sdk";
import os from "os";
import yargs from "yargs/yargs";
import {
  loadKeypair,
  parseEmissionsSchedule,
  sendInstructionsOrSquads,
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
    iotMint: {
      type: "string",
      describe: "IOT mint of the subdao to migrate",
      default: IOT_MINT.toBase58(),
    },
    hntMint: {
      type: "string",
      describe: "HNT mint of the subdao to migrate",
      default: HNT_MINT.toBase58(),
    },
    mobileMint: {
      type: "string",
      describe: "Mobile mint of the subdao to migrate",
      default: MOBILE_MINT.toBase58(),
    },
    rewardsOracleUrl: {
      alias: "ro",
      type: "string",
      describe: "The rewards oracle URL",
      required: true,
    },
    oracleKey: {
      type: "string",
      describe: "Pubkey of the oracle",
      required: true,
    },
    emissionSchedulePath: {
      required: true,
      describe: "Path to file that contains the hnt emissions schedule",
      type: "string",
    },
    hstEmissionsSchedulePath: {
      required: true,
      describe: "Path to file that contains the new HST emissions schedule",
      type: "string",
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
  const wallet = new anchor.Wallet(loadKeypair(argv.wallet));
  const lazyDistProgram = await initLazy(provider);
  const hsdProgram = await initHsd(provider);

  const instructions: TransactionInstruction[] = [];

  const hntMint = new PublicKey(argv.hntMint);
  const dao = daoKey(hntMint)[0];

  const resizes: TransactionInstruction[] = [];
  resizes.push(
    await hsdProgram.methods
      .tempResizeAccount()
      .accounts({
        account: dao,
        payer: wallet.publicKey,
      })
      .instruction()
  );
  const daoEpochInfos = await hsdProgram.account.daoEpochInfoV0.all();
  for (const daoEpochInfo of daoEpochInfos) {
    resizes.push(
      await hsdProgram.methods
        .tempResizeAccount()
        .accounts({
          account: daoEpochInfo.publicKey,
          payer: wallet.publicKey,
        })
        .instruction()
    );
  }
  console.log("Resizing accounts");
  await batchParallelInstructionsWithPriorityFee(provider, resizes);``

  const daoAcc = await hsdProgram.account.daoV0.fetch(dao);
  const authority = daoAcc.authority;
  const oracleKey = new PublicKey(argv.oracleKey!);
  const emissionSchedule = await parseEmissionsSchedule(
    argv.emissionSchedulePath
  );

  const ld = lazyDistributorKey(hntMint)[0];
  const ldAcc = await lazyDistProgram.account.lazyDistributorV0.fetchNullable(
    ld
  );
  if (ldAcc) {
    console.warn("Lazy distributor already exists, skipping.");
  } else {
    instructions.push(
      await lazyDistProgram.methods
        .initializeLazyDistributorV0({
          authority: daoAcc.authority,
          oracles: [
            {
              oracle: oracleKey,
              url: argv.rewardsOracleUrl,
            },
          ],
          // 5 x epoch rewards in a 24 hour period
          windowConfig: {
            windowSizeSeconds: new anchor.BN(24 * 60 * 60),
            thresholdType: ThresholdType.Absolute as never,
            threshold: new anchor.BN(emissionSchedule[0].emissionsPerEpoch).mul(
              new anchor.BN(5)
            ),
          },
          approver: oracleSignerKey()[0],
        })
        .accounts({
          payer: authority,
          rewardsMint: hntMint,
        })
        .instruction()
    );
  }

  instructions.push(
    await hsdProgram.methods
      .updateDaoV0({
        authority: null,
        emissionSchedule: null,
        hstEmissionSchedule: await parseEmissionsSchedule(
          argv.hstEmissionsSchedulePath!
        ),
        netEmissionsCap: null,
        hstPool: null,
        proposalNamespace: organizationKey("Helium")[0],
        delegatorRewardsPercent: delegatorRewardsPercent(6),
      })
      .accounts({
        dao,
        authority: daoAcc.authority,
        payer: daoAcc.authority,
      })
      .instruction()
  );

  if (!daoAcc.rewardsEscrow) {
    instructions.push(
      await hsdProgram.methods
        .initializeHntDelegatorPool()
        .accounts({
          dao,
          payer: daoAcc.authority,
          delegatorPool: getAssociatedTokenAddressSync(hntMint, dao, true),
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
