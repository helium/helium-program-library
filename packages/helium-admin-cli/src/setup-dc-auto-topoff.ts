import * as anchor from "@coral-xyz/anchor";
import { dataCreditsKey, delegatedDataCreditsKey, init as initDc } from "@helium/data-credits-sdk";
import { autoTopOffKey, init as initDcAutoTopoff, queueAuthorityKey } from "@helium/dc-auto-top-sdk";
import { daoKey, subDaoKey } from "@helium/helium-sub-daos-sdk";
import { TASK_QUEUE_ID } from "@helium/hpl-crons-sdk";
import { DC_MINT, HNT_MINT, MOBILE_MINT } from "@helium/spl-utils";
import { createAssociatedTokenAccountIdempotentInstruction, getAssociatedTokenAddressSync } from "@solana/spl-token";
import { ComputeBudgetProgram, PublicKey, SystemProgram, TransactionInstruction } from "@solana/web3.js";
import Squads from "@sqds/sdk";
import os from "os";
import yargs from "yargs/yargs";
import { loadKeypair, sendInstructionsOrSquads } from "./utils";
import { init as initTuktuk, nextAvailableTaskIds, taskKey, taskQueueAuthorityKey } from "@helium/tuktuk-sdk";

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
      describe: "Pubkey of the HNT token",
      default: HNT_MINT.toBase58(),
    },
    dcMint: {
      type: "string",
      describe: "Pubkey of the Data Credit token",
      default: DC_MINT.toBase58(),
    },
    threshold: {
      type: "number",
      describe: "Threshold for auto topoff in DC, raw with no decimals",
      default: 1,
    },
    initialLamports: {
      type: "number",
      describe: "Initial lamports to send to the auto topoff, pays for crank turns.",
      default: 10000000,
    },
    routerKey: {
      type: "string",
      describe: "The router key for the delegated data credits",
      required: true,
    },
    subDaoMint: {
      type: "string",
      describe: "The sub dao mint for the delegated data credits",
      default: MOBILE_MINT.toBase58(),
    },
    multisig: {
      type: 'string',
      describe:
        'Address of the squads multisig to be authority. If not provided, your wallet will be the authority',
    },
    authorityIndex: {
      type: 'number',
      describe: 'Authority index for squads. Defaults to 1',
      default: 1,
    },
    schedule: {
      type: 'string',
      describe: 'Cron schedule for the auto topoff',
      required: true,
    },
  });

  const argv = await yarg.argv;
  process.env.ANCHOR_WALLET = argv.wallet;
  process.env.ANCHOR_PROVIDER_URL = argv.url;
  anchor.setProvider(anchor.AnchorProvider.local(argv.url));
  const hntMint = new PublicKey(HNT_MINT);
  const subDaoMint = new PublicKey(argv.subDaoMint);
  const subDao = subDaoKey(subDaoMint)[0];
  const dcMint = new PublicKey(argv.dcMint);


  const provider = anchor.getProvider() as anchor.AnchorProvider;
  const dataCreditsProgram = await initDc(provider);
  const dcAutoTopoffProgram = await initDcAutoTopoff(provider);
  const tuktukProgram = await initTuktuk(provider);

  const wallet = new anchor.Wallet(loadKeypair(argv.wallet));
  const squads = Squads.endpoint(process.env.ANCHOR_PROVIDER_URL, wallet, {
    commitmentOrConfig: "finalized",
  });
  let authority = provider.wallet.publicKey;
  let multisig = argv.multisig ? new PublicKey(argv.multisig) : null;
  if (multisig) {
    authority = squads.getAuthorityPDA(multisig, argv.authorityIndex);
  }

  const routerKey = argv.routerKey;
  const delegatedDc = delegatedDataCreditsKey(subDao, routerKey)[0]
  const instructions: TransactionInstruction[] = []
  const delegatedDcAcc = await dataCreditsProgram.account.delegatedDataCreditsV0.fetchNullable(delegatedDc)
  if (!delegatedDcAcc) {
    instructions.push(
      createAssociatedTokenAccountIdempotentInstruction(
        authority,
        getAssociatedTokenAddressSync(dcMint, authority, true),
        authority,
        dcMint,
      ),
      await dataCreditsProgram.methods.delegateDataCreditsV0({
        routerKey,
        amount: new anchor.BN(0),
      })
        .accountsPartial({
          payer: authority,
          subDao: subDao,
          delegatedDataCredits: delegatedDc,
          dcMint,
          dao: daoKey(hntMint)[0],
          fromAccount: getAssociatedTokenAddressSync(dcMint, authority, true),
          dataCredits: dataCreditsKey(dcMint)[0],
        })
        .instruction()
    )
  }

  const autoTopOff = autoTopOffKey(delegatedDc, authority)[0]

  const taskQueue = await tuktukProgram.account.taskQueueV0.fetch(TASK_QUEUE_ID)
  const [nextPythTask, nextTask] = nextAvailableTaskIds(taskQueue.taskBitmap, 2)
  const autoTopOffAcc = await dcAutoTopoffProgram.account.autoTopOffV0.fetchNullable(autoTopOff!)
  if (autoTopOffAcc) {
    const queueAuthority = queueAuthorityKey()[0]
    const updateIx = await dcAutoTopoffProgram.methods.updateAutoTopOffV0({
      newTaskId: nextTask,
      newPythTaskId: nextPythTask,
      schedule: argv.schedule,
      threshold: new anchor.BN(argv.threshold),
    })
      .accountsStrict({
        payer: authority,
        autoTopOff: autoTopOff!,
        nextTask: autoTopOffAcc.nextTask,
        newTask: taskKey(TASK_QUEUE_ID, nextTask)[0],
        newPythTask: taskKey(TASK_QUEUE_ID, nextPythTask)[0],
        taskQueue: TASK_QUEUE_ID,
        authority: authority,
        systemProgram: SystemProgram.programId,
        queueAuthority,
        nextPythTask: autoTopOffAcc.nextPythTask,
        taskQueueAuthority: taskQueueAuthorityKey(TASK_QUEUE_ID, queueAuthority)[0],
        tuktukProgram: tuktukProgram.programId,
      })
      .instruction()
    instructions.push(updateIx)
  } else {
    const instruction = await dcAutoTopoffProgram.methods.initializeAutoTopOffV0({
      schedule: argv.schedule,
      threshold: new anchor.BN(argv.threshold),
      routerKey,
    })
      .accountsPartial({
        payer: authority,
        authority,
        taskQueue: TASK_QUEUE_ID,
        delegatedDataCredits: delegatedDc,
        dao: daoKey(hntMint)[0],
        dataCredits: dataCreditsKey(dcMint)[0],
        dcMint,
        hntMint,
        subDao,
      })
      .instruction()

    instructions.push(instruction)
    const { instruction: scheduleTaskInstruction, pubkeys: { queueAuthority } } = await dcAutoTopoffProgram.methods.scheduleTaskV0({
      taskId: nextTask,
      pythTaskId: nextPythTask,
    })
      .accountsPartial({
        payer: authority,
        autoTopOff: autoTopOff!,
        nextTask: autoTopOff!,
        task: taskKey(TASK_QUEUE_ID, nextTask)[0],
        pythTask: taskKey(TASK_QUEUE_ID, nextPythTask)[0],
        taskQueue: TASK_QUEUE_ID,
      })
      .prepare()
    console.log("Queue authority", queueAuthority!.toBase58())
    instructions.push(scheduleTaskInstruction)

    instructions.push(
      SystemProgram.transfer({
        fromPubkey: authority,
        toPubkey: autoTopOff!,
        lamports: argv.initialLamports,
      })
    )
  }

  await sendInstructionsOrSquads({
    provider,
    instructions,
    executeTransaction: false,
    squads,
    multisig: argv.multisig ? new PublicKey(argv.multisig) : undefined,
    authorityIndex: argv.authorityIndex,
    signers: [],
  });
  console.log(`Initialized auto topoff for ${routerKey} with schedule ${argv.schedule} and threshold ${argv.threshold}. Send HNT to ${autoTopOff!.toBase58()}`);
}
