import * as anchor from "@anchor-lang/core";
import { cronJobKey, cronJobTransactionKey } from "@helium/cron-sdk";
import {
  entityCronAuthorityKey,
  init as initHplCrons,
} from "@helium/hpl-crons-sdk";
import {
  batchInstructionsToTxsWithPriorityFee,
  bulkSendTransactions,
  chunks,
} from "@helium/spl-utils";
import { customSignerKey } from "@helium/tuktuk-sdk";
import { PublicKey, TransactionInstruction } from "@solana/web3.js";
import fs from "fs";
import os from "os";
import yargs from "yargs/yargs";

// Temporary: drives hpl-crons `backfill_entity_claim_wallet_v0`, and goes away with it.
const BACKFILL_SIGNER = new PublicKey(
  "hprdnjkbziK8NqhThmAn5Gu4XqrBbctX8du4PfJdgvW"
);
const CRON_PROGRAM = new PublicKey(
  "cronAjRZnJn3MTP3B9kE62NWDrjSuAPVXf9c4hu4grM"
);
const ORACLE_URL = "https://hnt-rewards.oracle.helium.io";
// Space of a cron transaction holding a remote source, after the cron program's resize_to_fit:
// discriminator, id, cron job, variant, url, signer, bump.
const remoteTransactionSpace = (url: string) =>
  8 + 4 + 32 + 1 + 4 + Buffer.byteLength(url) + 32 + 1;

export async function run(args: any = process.argv) {
  const yarg = yargs(args).options({
    wallet: {
      alias: "k",
      describe: "Anchor wallet keypair; must be the backfill signer",
      default: `${os.homedir()}/.config/solana/id.json`,
    },
    url: {
      alias: "u",
      default: "http://127.0.0.1:8899",
      describe: "The solana url",
    },
    owners: {
      type: "string",
      required: true,
      describe: "JSON file holding an array of cron owner wallet addresses",
    },
    idl: {
      type: "string",
      required: true,
      describe:
        "hpl_crons IDL that includes backfill_entity_claim_wallet_v0 (the on-chain IDL may lag the program)",
    },
    commit: {
      type: "boolean",
      describe: "Actually send transactions. Otherwise dry-run",
      default: false,
    },
  });
  const argv = await yarg.argv;
  process.env.ANCHOR_WALLET = argv.wallet;
  process.env.ANCHOR_PROVIDER_URL = argv.url;
  anchor.setProvider(anchor.AnchorProvider.local(argv.url));
  const provider = anchor.getProvider() as anchor.AnchorProvider;
  const connection = provider.connection;

  if (argv.commit && !provider.wallet.publicKey.equals(BACKFILL_SIGNER)) {
    throw new Error(
      `Wallet ${provider.wallet.publicKey.toBase58()} is not the backfill signer ${BACKFILL_SIGNER.toBase58()}`
    );
  }

  const program = await initHplCrons(
    provider,
    undefined,
    JSON.parse(fs.readFileSync(argv.idl, "utf8"))
  );
  const owners = [
    ...new Set<string>(JSON.parse(fs.readFileSync(argv.owners, "utf8"))),
  ].map((o) => new PublicKey(o));

  const targets = owners.map((wallet) => {
    const authority = entityCronAuthorityKey(wallet)[0];
    const cronJob = cronJobKey(authority, 0)[0];
    return {
      wallet,
      authority,
      cronJob,
      cronJobTransaction: cronJobTransactionKey(cronJob, 0)[0],
    };
  });

  const fetchAll = async (keys: PublicKey[]) =>
    (
      await Promise.all(
        chunks(keys, 100).map((chunk) =>
          connection.getMultipleAccountsInfo(chunk)
        )
      )
    ).flat();

  const [cronAccounts, transactionAccounts] = await Promise.all([
    fetchAll(targets.map((t) => t.cronJob)),
    fetchAll(targets.map((t) => t.cronJobTransaction)),
  ]);

  const skipped = {
    missing: 0,
    hasClaims: 0,
    removedFromQueue: 0,
    transactionExists: 0,
  };
  const ready: ((typeof targets)[number] & {
    taskQueue: PublicKey;
    notScheduled: boolean;
  })[] = [];
  targets.forEach((target, i) => {
    const info = cronAccounts[i];
    if (!info || !info.owner.equals(CRON_PROGRAM)) {
      skipped.missing++;
      return;
    }
    const cron = program.coder.accounts.decode("cronJobV0", info.data);
    if (cron.nextTransactionId !== 0) {
      skipped.hasClaims++;
    } else if (cron.removedFromQueue) {
      skipped.removedFromQueue++;
    } else if (transactionAccounts[i]) {
      skipped.transactionExists++;
    } else {
      ready.push({
        ...target,
        taskQueue: cron.taskQueue,
        notScheduled: cron.nextScheduleTask.equals(PublicKey.default),
      });
    }
  });

  // The oracle skips a wallet claim when its claim_payer holds less than rent-exempt
  // minimum plus a crank reward per hotspot and one more. One hotspot is the floor.
  const taskQueues = [...new Set(ready.map((r) => r.taskQueue.toBase58()))];
  const minCrankRewards = new Map<string, number>();
  for (const taskQueue of taskQueues) {
    const queue = await program.account.taskQueueV0.fetch(taskQueue);
    minCrankRewards.set(taskQueue, queue.minCrankReward.toNumber());
  }
  const walletMinRent = await connection.getMinimumBalanceForRentExemption(0);
  const claimPayers = await fetchAll(
    ready.map(
      (r) =>
        customSignerKey(r.taskQueue, [
          Buffer.from("claim_payer"),
          r.wallet.toBuffer(),
        ])[0]
    )
  );
  const underfunded = ready.filter(
    (r, i) =>
      (claimPayers[i]?.lamports ?? 0) <
      walletMinRent + 2 * minCrankRewards.get(r.taskQueue.toBase58())!
  ).length;

  let rentLamports = 0;
  for (const r of ready) {
    rentLamports += await connection.getMinimumBalanceForRentExemption(
      remoteTransactionSpace(
        `${ORACLE_URL}/v1/tuktuk/wallet/${r.wallet.toBase58()}`
      )
    );
  }
  const signerBalance = await connection.getBalance(BACKFILL_SIGNER);

  console.log(`Owners: ${owners.length}`);
  console.log(`Skipped, no cron: ${skipped.missing}`);
  console.log(`Skipped, cron already has claims: ${skipped.hasClaims}`);
  console.log(`Skipped, cron removed from queue: ${skipped.removedFromQueue}`);
  console.log(
    `Skipped, transaction 0 already exists: ${skipped.transactionExists}`
  );
  console.log(`To backfill: ${ready.length}`);
  console.log(
    `  of which no schedule task set: ${
      ready.filter((r) => r.notScheduled).length
    }`
  );
  console.log(
    `  of which claim_payer below the one-hotspot floor (will claim nothing until topped up): ${underfunded}`
  );
  console.log(
    `Rent paid by ${BACKFILL_SIGNER.toBase58()}: ${
      rentLamports / 1e9
    } SOL, plus fees. Balance: ${signerBalance / 1e9} SOL`
  );

  if (!argv.commit) {
    console.log("Dry run. Re-run with --commit to send.");
    return;
  }
  if (signerBalance < rentLamports) {
    throw new Error("Backfill signer cannot pay the rent");
  }

  const instructions: TransactionInstruction[] = await Promise.all(
    ready.map((r) =>
      program.methods
        .backfillEntityClaimWalletV0()
        .accountsStrict({
          payer: BACKFILL_SIGNER,
          wallet: r.wallet,
          authority: r.authority,
          cronJob: r.cronJob,
          cronJobTransaction: r.cronJobTransaction,
          systemProgram: anchor.web3.SystemProgram.programId,
          cronProgram: CRON_PROGRAM,
        })
        .instruction()
    )
  );
  const txns = await batchInstructionsToTxsWithPriorityFee(
    provider,
    instructions,
    { useFirstEstimateForAll: true, computeUnitLimit: 600000 }
  );
  await bulkSendTransactions(provider, txns, (status) => {
    console.log(
      `Sending ${status.currentBatchProgress} / ${status.currentBatchSize} in batch. ${status.totalProgress} / ${txns.length}`
    );
  });
  console.log("Done. Re-run without --commit to confirm nothing is left.");
}
