import * as anchor from "@coral-xyz/anchor";
import { TASK_QUEUE_ID } from "@helium/hpl-crons-sdk";
import { init as initMfan } from "@helium/mini-fanout-sdk";
import { HNT_MINT, sendInstructionsWithPriorityFee } from "@helium/spl-utils";
import {
  init as initTuktuk,
  nextAvailableTaskIds,
  taskKey,
} from "@helium/tuktuk-sdk";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";
import {
  PublicKey,
  SystemProgram,
  TransactionInstruction,
} from "@solana/web3.js";
import * as multisig from "@sqds/multisig";
import os from "os";
import yargs from "yargs/yargs";
import { COUNCIL_FANOUT_TOKEN_ACCOUNT } from "./hip149";
import { loadKeypair } from "./utils";

// HIP 149 Decision 4: create the Advisory Council compensation fanout. The supplement mint in
// helium-sub-daos splits off 1.25% to this fanout's HNT token account; the fanout's tuktuk
// crank then distributes it pro-rata among the seated community members.
//
// After creating it, paste the printed "Council fanout token account" into
// COUNCIL_FANOUT_TOKEN_ACCOUNT in programs/helium-sub-daos/src/supplement.rs (the same
// patch-time edit that sets INFLATION_START), then set the cron's council_vault to it.
//
// Operational rules (see HIP 149 Decision 4):
//   - `owner` MUST be the governance multisig's vault, never the Receiving Entity. It is the
//     only authority that can edit the seated-member set; the community seats/removes members
//     by vote and the multisig executes the corresponding update. Prefer --multisig over
//     --owner: it derives the vault the same way update-council-fanout.ts and
//     close-council-fanout.ts do, instead of relying on a manually-typed vault address.
//   - On a seat change, CRANK before updating the member vec, so accrual maps to the set that
//     was seated when it accrued (a vacant seat's share then redistributes to the seated
//     members from that point forward, per the HIP).
//   - Keep the fanout funded with lamports; it pays its own crank reward and silently
//     unschedules itself if it runs dry.
//   - Closing the fanout refunds its rent to whoever paid to create it, not to the owner:
//     initialize_mini_fanout_v0 stores `ctx.accounts.payer.key()` as `rent_refund` and never
//     reads the account passed under that name. Pick the payer accordingly.
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
    owner: {
      type: "string",
      describe:
        "Fanout owner = governance multisig (Squads vault) address directly. Edits the seated-member set. NEVER the Receiving Entity. Prefer --multisig, which derives this the same way update-council-fanout.ts and close-council-fanout.ts do; use --owner only to bypass that derivation.",
    },
    multisig: {
      type: "string",
      describe:
        "Address of the squads multisig whose vault (index 0) should own the fanout. Derives --owner for you, the same way update-council-fanout.ts and close-council-fanout.ts derive it from --multisig. Exactly one of --owner / --multisig is required.",
    },
    members: {
      type: "string",
      required: true,
      describe:
        "Comma-separated seated community-member wallet addresses (the receiving wallets), KYC-confirmed. Each gets an equal share.",
    },
    schedule: {
      type: "string",
      default: "0 0 0 * * *",
      describe:
        "Cron schedule (sec min hour day month dow) for the distribution crank. Default daily at 00:00 UTC; keep it short to bound accrual-timing on seat changes.",
    },
    seed: {
      type: "string",
      default: "hip149-council",
      describe: "Fanout seed (part of the PDA). Stable per fanout.",
    },
    fundingLamports: {
      type: "number",
      default: 100_000_000,
      describe:
        "Lamports to seed the fanout with so it can pay its own crank reward.",
    },
  });
  const argv = await yarg.argv;
  process.env.ANCHOR_WALLET = argv.wallet;
  process.env.ANCHOR_PROVIDER_URL = argv.url;
  anchor.setProvider(anchor.AnchorProvider.local(argv.url));
  const provider = anchor.getProvider() as anchor.AnchorProvider;
  const wallet = new anchor.Wallet(loadKeypair(argv.wallet));

  const program = await initMfan(provider);
  const tuktukProgram = await initTuktuk(provider);

  if (Boolean(argv.owner) === Boolean(argv.multisig)) {
    throw new Error("exactly one of --owner / --multisig is required");
  }
  const owner = argv.multisig
    ? (
        await multisig.getVaultPda({
          multisigPda: new PublicKey(argv.multisig),
          index: 0,
          programId: multisig.PROGRAM_ID,
        })
      )[0]
    : new PublicKey(argv.owner!); // validated above: exactly one of owner/multisig is set
  const members = argv.members
    .split(",")
    .map((m) => m.trim())
    .filter(Boolean)
    .map((m) => new PublicKey(m));
  if (members.length === 0) {
    throw new Error("at least one seated member wallet is required");
  }

  // Equal pro-rata weight per seated member; the fanout normalizes over whatever is in the
  // vec, so dropping a member on removal redistributes their share to the rest.
  const shares = members.map((wallet) => ({
    wallet,
    share: { share: { amount: 1 } },
  }));

  const instructions: TransactionInstruction[] = [];

  const {
    instruction: initIx,
    pubkeys: { miniFanout },
  } = await program.methods
    .initializeMiniFanoutV0({
      seed: Buffer.from(argv.seed, "utf-8"),
      shares,
      schedule: argv.schedule,
      preTask: null,
    })
    .accounts({
      payer: wallet.publicKey,
      owner,
      taskQueue: TASK_QUEUE_ID,
      // The account required here does not decide where rent goes:
      // initialize_mini_fanout_v0 stores `ctx.accounts.payer.key()` and never reads this one.
      // Passing the payer keeps the argument honest about the refund destination, and keeps a
      // vault that has no other role in this instruction out of the writable set. Change the
      // payer to change where closing the fanout refunds its rent.
      rentRefund: wallet.publicKey,
      mint: HNT_MINT,
    })
    .prepare();
  instructions.push(initIx);

  // The fanout PDA is seeded by the `namespace` signer and `--seed`. Anchor resolves that
  // signer to the provider wallet, so a different wallet, or a different seed, silently
  // produces a different PDA, a different HNT associated token account, and a fanout that
  // `issue_rewards_v0` rejects on its account pin. That would fail every epoch close inside a
  // supplement window. Members, owner and schedule do not enter the derivation, so this only
  // constrains the two inputs that have to stay fixed. Checked before anything is sent.
  const tokenAccount = getAssociatedTokenAddressSync(
    HNT_MINT,
    miniFanout!,
    true
  );
  if (!tokenAccount.equals(COUNCIL_FANOUT_TOKEN_ACCOUNT)) {
    throw new Error(
      `Derived fanout token account ${tokenAccount.toBase58()} does not match the ` +
        `COUNCIL_FANOUT_TOKEN_ACCOUNT pinned in issue_rewards_v0 ` +
        `(${COUNCIL_FANOUT_TOKEN_ACCOUNT.toBase58()}). Wrong signing wallet or wrong --seed.`
    );
  }

  // Fund the fanout so it can pay its own crank reward and stay scheduled.
  instructions.push(
    SystemProgram.transfer({
      fromPubkey: wallet.publicKey,
      toPubkey: miniFanout!,
      lamports: argv.fundingLamports,
    })
  );

  // Schedule the first distribution task; the fanout self-reschedules thereafter.
  //
  // `schedule_task_v0` declares `has_one = task_queue / next_task / next_pre_task` on the
  // fanout, and Anchor's client resolver satisfies those by fetching it. The instruction
  // above creates the fanout in this same transaction, so there is nothing on chain to fetch
  // and resolution fails before anything is sent. Each of those accounts is known ahead of
  // time instead: `initialize_mini_fanout_v0` stores the task queue it was handed, and sets
  // `next_task` and `next_pre_task` to the fanout's own key, the "no next task" sentinel that
  // the scheduling constraint accepts.
  const [queueAuthority] = PublicKey.findProgramAddressSync(
    [Buffer.from("queue_authority", "utf-8")],
    program.programId
  );
  const [taskQueueAuthority] = PublicKey.findProgramAddressSync(
    [
      Buffer.from("task_queue_authority", "utf-8"),
      TASK_QUEUE_ID.toBuffer(),
      queueAuthority.toBuffer(),
    ],
    tuktukProgram.programId
  );
  const taskQueueAcc = await tuktukProgram.account.taskQueueV0.fetch(
    TASK_QUEUE_ID
  );
  const [taskId, preTaskId] = nextAvailableTaskIds(taskQueueAcc.taskBitmap, 2);
  instructions.push(
    await program.methods
      .scheduleTaskV0({ taskId, preTaskId })
      .accountsPartial({
        payer: wallet.publicKey,
        miniFanout: miniFanout!,
        taskQueue: TASK_QUEUE_ID,
        queueAuthority,
        taskQueueAuthority,
        nextTask: miniFanout!,
        nextPreTask: miniFanout!,
        task: taskKey(TASK_QUEUE_ID, taskId)[0],
        preTask: taskKey(TASK_QUEUE_ID, preTaskId)[0],
      })
      .instruction()
  );

  await sendInstructionsWithPriorityFee(provider, instructions);

  console.log("Council fanout created.");
  if (argv.multisig) {
    console.log(`  multisig:                    ${argv.multisig}`);
  }
  console.log(`  owner (governance multisig vault): ${owner.toBase58()}`);
  console.log(`  mini fanout:                 ${miniFanout!.toBase58()}`);
  console.log(`  schedule:                    ${argv.schedule}`);
  console.log(`  members (${members.length}):`);
  members.forEach((m) => console.log(`    - ${m.toBase58()}`));
  console.log("");
  console.log(
    "  >>> Council fanout token account (matches COUNCIL_FANOUT_TOKEN_ACCOUNT):"
  );
  console.log(`      ${tokenAccount.toBase58()}`);
}
