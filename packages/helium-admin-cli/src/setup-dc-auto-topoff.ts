import * as anchor from "@coral-xyz/anchor";
import {
  dataCreditsKey,
  delegatedDataCreditsKey,
  init as initDc,
} from "@helium/data-credits-sdk";
import {
  autoTopOffKey,
  init as initDcAutoTopoff,
  queueAuthorityKey,
} from "@helium/dc-auto-top-sdk";
import { daoKey, subDaoKey } from "@helium/helium-sub-daos-sdk";
import { TASK_QUEUE_ID } from "@helium/hpl-crons-sdk";
import { DC_MINT, HNT_MINT, MOBILE_MINT } from "@helium/spl-utils";
import * as multisig from "@sqds/multisig";
import {
  createAssociatedTokenAccountIdempotentInstruction,
  createTransferInstruction,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import {
  ComputeBudgetProgram,
  PublicKey,
  SystemProgram,
  TransactionInstruction,
} from "@solana/web3.js";
import os from "os";
import yargs from "yargs/yargs";
import { loadKeypair, sendInstructionsOrSquadsV4 } from "./utils";
import {
  init as initTuktuk,
  nextAvailableTaskIds,
  taskKey,
  taskQueueAuthorityKey,
} from "@helium/tuktuk-sdk";

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
    },
    initialLamports: {
      type: "number",
      describe:
        "Initial lamports to send to the auto topoff, pays for crank turns.",
      default: 10000000,
    },
    newAuthority: {
      type: "string",
      describe: "New authority for the auto topoff",
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
      type: "string",
      describe:
        "Address of the squads multisig to be authority. If not provided, your wallet will be the authority",
    },
    schedule: {
      type: "string",
      describe: "Cron schedule for the auto topoff",
    },
    hntPriceOracle: {
      type: "string",
      describe: "Pubkey of the HNT price oracle",
    },
    hntThreshold: {
      type: "number",
      describe: "HNT threshold for the auto topoff",
    },
    dcaMint: {
      type: "string",
      describe: "Pubkey of the DCA mint",
    },
    dcaSwapAmount: {
      type: "number",
      describe: "DCA swap amount for the auto topoff",
    },
    dcaIntervalSeconds: {
      type: "number",
      describe: "DCA interval seconds for the auto topoff",
    },
    dcaInputPriceOracle: {
      type: "string",
      describe: "Pubkey of the DCA input price oracle",
    },
    dcaOutputPriceOracle: {
      type: "string",
      describe: "Pubkey of the DCA output price oracle",
    },
    dcaSigner: {
      type: "string",
      describe: "Pubkey of the DCA signer",
    },
    dcaUrl: {
      type: "string",
      describe: "URL of the DCA server",
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
  let authority = provider.wallet.publicKey;
  let multisigPda = argv.multisig ? new PublicKey(argv.multisig) : null;
  if (multisigPda) {
    const [vaultPda] = multisig.getVaultPda({
      multisigPda,
      index: 0,
    });
    authority = vaultPda;
  }

  const routerKey = argv.routerKey;
  const delegatedDc = delegatedDataCreditsKey(subDao, routerKey)[0];
  const instructions: TransactionInstruction[] = [];
  const delegatedDcAcc =
    await dataCreditsProgram.account.delegatedDataCreditsV0.fetchNullable(
      delegatedDc
    );
  if (!delegatedDcAcc) {
    instructions.push(
      createAssociatedTokenAccountIdempotentInstruction(
        authority,
        getAssociatedTokenAddressSync(dcMint, authority, true),
        authority,
        dcMint
      ),
      await dataCreditsProgram.methods
        .delegateDataCreditsV0({
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
    );
  }

  const autoTopOff = autoTopOffKey(delegatedDc, authority)[0];
  const taskQueue = await tuktukProgram.account.taskQueueV0.fetch(
    TASK_QUEUE_ID
  );
  const [nextTask, nextHntTask] = nextAvailableTaskIds(taskQueue.taskBitmap, 2);

  const autoTopOffAcc =
    await dcAutoTopoffProgram.account.autoTopOffV0.fetchNullable(autoTopOff!);

  // Check if auto topoff exists with different authority
  if (autoTopOffAcc && !autoTopOffAcc.authority.equals(authority)) {
    console.log(
      `Authority mismatch detected. Old authority: ${autoTopOffAcc.authority.toBase58()}, New authority: ${authority.toBase58()}`
    );

    // Get HNT balance from old auto topoff
    const oldAutoTopOffHntAccount = getAssociatedTokenAddressSync(
      hntMint,
      autoTopOff!,
      true
    );
    const oldHntAccountInfo = await provider.connection.getAccountInfo(
      oldAutoTopOffHntAccount
    );
    let oldHntBalance = new anchor.BN(0);
    if (oldHntAccountInfo) {
      const oldHntAccount = await provider.connection.getTokenAccountBalance(
        oldAutoTopOffHntAccount
      );
      oldHntBalance = new anchor.BN(oldHntAccount.value.amount);
      console.log(`Old auto topoff HNT balance: ${oldHntBalance.toString()}`);
    }

    // Close the old auto topoff
    const closeIx = await dcAutoTopoffProgram.methods
      .closeAutoTopOffV0()
      .accounts({
        autoTopOff: autoTopOff!,
        rentRefund: authority,
      })
      .instruction();
    instructions.push(closeIx);

    const schedule = argv.schedule
      ? argv.schedule
      : Buffer.from(autoTopOffAcc.schedule)
          .toString("utf-8")
          .replace(/\0/g, "");
    const threshold = argv.threshold
      ? new anchor.BN(argv.threshold)
      : autoTopOffAcc.threshold;

    const newAutoTopOff = autoTopOffKey(delegatedDc, authority)[0];
    const initIx = await dcAutoTopoffProgram.methods
      .initializeAutoTopOffV0({
        schedule,
        threshold,
        routerKey,
        hntThreshold: argv.hntThreshold
          ? new anchor.BN(argv.hntThreshold)
          : autoTopOffAcc.hntThreshold,
        dcaMint: argv.dcaMint
          ? new PublicKey(argv.dcaMint)
          : autoTopOffAcc.dcaMint,
        dcaSwapAmount: argv.dcaSwapAmount
          ? new anchor.BN(argv.dcaSwapAmount)
          : autoTopOffAcc.dcaSwapAmount,
        dcaIntervalSeconds: argv.dcaIntervalSeconds
          ? new anchor.BN(argv.dcaIntervalSeconds)
          : autoTopOffAcc.dcaIntervalSeconds,
        dcaInputPriceOracle: argv.dcaInputPriceOracle
          ? new PublicKey(argv.dcaInputPriceOracle)
          : autoTopOffAcc.dcaInputPriceOracle,
        dcaSigner: argv.dcaSigner
          ? new PublicKey(argv.dcaSigner)
          : autoTopOffAcc.dcaSigner,
        dcaUrl: argv.dcaUrl
          ? argv.dcaUrl
          : Buffer.from(autoTopOffAcc.dcaUrl)
              .toString("utf-8")
              .replace(/\0/g, ""),
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
        hntPriceOracle: argv.hntPriceOracle
          ? new PublicKey(argv.hntPriceOracle)
          : autoTopOffAcc.hntPriceOracle,
      })
      .instruction();
    instructions.push(initIx);

    const { instruction: scheduleTaskInstruction } =
      await dcAutoTopoffProgram.methods
        .scheduleTaskV0({
          taskId: nextTask,
          hntTaskId: nextHntTask,
        })
        .accountsPartial({
          payer: authority,
          autoTopOff: autoTopOff!,
          nextTask: autoTopOff!,
          task: taskKey(TASK_QUEUE_ID, nextTask)[0],
          hntTask: taskKey(TASK_QUEUE_ID, nextHntTask)[0],
          taskQueue: TASK_QUEUE_ID,
        })
        .prepare();
    instructions.push(scheduleTaskInstruction);

    instructions.push(
      SystemProgram.transfer({
        fromPubkey: authority,
        toPubkey: newAutoTopOff,
        lamports: argv.initialLamports,
      })
    );

    // Transfer HNT from old wallet (if any) to new auto topoff
    if (oldHntBalance.gt(new anchor.BN(0))) {
      const walletHntAccount = getAssociatedTokenAddressSync(
        hntMint,
        authority,
        true
      );
      const newAutoTopOffHntAccount = getAssociatedTokenAddressSync(
        hntMint,
        newAutoTopOff,
        true
      );

      instructions.push(
        createAssociatedTokenAccountIdempotentInstruction(
          authority,
          newAutoTopOffHntAccount,
          newAutoTopOff,
          hntMint
        )
      );

      instructions.push(
        createTransferInstruction(
          walletHntAccount,
          newAutoTopOffHntAccount,
          authority,
          BigInt(oldHntBalance.toString())
        )
      );

      console.log(
        `Will transfer ${oldHntBalance.toString()} HNT from wallet to new auto topoff`
      );
    }
  } else if (autoTopOffAcc) {
    const queueAuthority = queueAuthorityKey()[0];
    const taskRentRefund =
      (await tuktukProgram.account.taskV0.fetchNullable(autoTopOffAcc.nextTask))
        ?.rentRefund || authority;
    const hntTaskRentRefund =
      (
        await tuktukProgram.account.taskV0.fetchNullable(
          autoTopOffAcc.nextHntTask
        )
      )?.rentRefund || authority;

    // Update the auto topoff configuration
    const updateIx = await dcAutoTopoffProgram.methods
      .updateAutoTopOffV0({
        schedule: argv.schedule ? argv.schedule : null,
        threshold: argv.threshold ? new anchor.BN(argv.threshold) : null,
        hntPriceOracle: argv.hntPriceOracle
          ? new PublicKey(argv.hntPriceOracle)
          : null,
        hntThreshold: argv.hntThreshold
          ? new anchor.BN(argv.hntThreshold)
          : null,
        dcaSwapAmount: argv.dcaSwapAmount
          ? new anchor.BN(argv.dcaSwapAmount)
          : null,
        dcaIntervalSeconds: argv.dcaIntervalSeconds
          ? new anchor.BN(argv.dcaIntervalSeconds)
          : null,
        dcaInputPriceOracle: argv.dcaInputPriceOracle
          ? new PublicKey(argv.dcaInputPriceOracle)
          : null,
      })
      .accountsPartial({
        payer: authority,
        autoTopOff: autoTopOff!,
        nextTask: autoTopOffAcc.nextTask,
        nextHntTask: autoTopOffAcc.nextHntTask,
        taskRentRefund,
        hntTaskRentRefund,
        authority: autoTopOffAcc.authority,
        dcaMint: argv.dcaMint
          ? new PublicKey(argv.dcaMint)
          : autoTopOffAcc.dcaMint,
      })
      .instruction();
    instructions.push(updateIx);

    // Schedule new tasks separately
    const scheduleTaskIx = await dcAutoTopoffProgram.methods
      .scheduleTaskV0({
        taskId: nextTask,
        hntTaskId: nextHntTask,
      })
      .accountsPartial({
        payer: authority,
        autoTopOff: autoTopOff!,
        nextTask: autoTopOffAcc.nextTask,
        task: taskKey(TASK_QUEUE_ID, nextTask)[0],
        hntTask: taskKey(TASK_QUEUE_ID, nextHntTask)[0],
        taskQueue: TASK_QUEUE_ID,
      })
      .instruction();
    instructions.push(scheduleTaskIx);
  } else {
    if (!argv.schedule || !argv.threshold) {
      throw new Error(
        "Schedule and threshold are required to initialize auto topoff"
      );
    }
    if (!argv.hntPriceOracle) {
      throw new Error("HNT price oracle is required to initialize auto topoff");
    }
    if (!argv.dcaSigner) {
      throw new Error("DCA signer is required to initialize auto topoff");
    }
    if (!argv.dcaUrl) {
      throw new Error("DCA URL is required to initialize auto topoff");
    }
    const instruction = await dcAutoTopoffProgram.methods
      .initializeAutoTopOffV0({
        schedule: argv.schedule!,
        threshold: new anchor.BN(argv.threshold!),
        routerKey,
        hntThreshold: new anchor.BN(argv.hntThreshold!),
        dcaMint: new PublicKey(argv.dcaMint!),
        dcaSwapAmount: new anchor.BN(argv.dcaSwapAmount!),
        dcaIntervalSeconds: new anchor.BN(argv.dcaIntervalSeconds!),
        dcaInputPriceOracle: new PublicKey(argv.dcaInputPriceOracle!),
        dcaSigner: new PublicKey(argv.dcaSigner!),
        dcaUrl: argv.dcaUrl!,
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
        hntPriceOracle: new PublicKey(argv.hntPriceOracle),
      })
      .instruction();

    instructions.push(instruction);
    const {
      instruction: scheduleTaskInstruction,
      pubkeys: { queueAuthority },
    } = await dcAutoTopoffProgram.methods
      .scheduleTaskV0({
        taskId: nextTask,
        hntTaskId: nextHntTask,
      })
      .accountsPartial({
        payer: authority,
        autoTopOff: autoTopOff!,
        nextTask: autoTopOff!,
        task: taskKey(TASK_QUEUE_ID, nextTask)[0],
        hntTask: taskKey(TASK_QUEUE_ID, nextHntTask)[0],
        taskQueue: TASK_QUEUE_ID,
      })
      .prepare();
    console.log("Queue authority", queueAuthority!.toBase58());
    instructions.push(scheduleTaskInstruction);

    instructions.push(
      SystemProgram.transfer({
        fromPubkey: authority,
        toPubkey: autoTopOff!,
        lamports: argv.initialLamports,
      })
    );
  }

  await sendInstructionsOrSquadsV4({
    provider,
    instructions,
    multisig: multisigPda!,
    signers: [],
  });
  console.log(
    `Initialized auto topoff for ${routerKey} with schedule ${
      argv.schedule
    } and threshold ${argv.threshold}. Send HNT to ${autoTopOff!.toBase58()}`
  );
}
