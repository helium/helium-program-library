import * as anchor from "@coral-xyz/anchor";
import { init as initMfan } from "@helium/mini-fanout-sdk";
import { init as initTuktuk } from "@helium/tuktuk-sdk";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";
import { PublicKey } from "@solana/web3.js";
import os from "os";
import yargs from "yargs/yargs";
import { resolveTaskRentRefund } from "./mini-fanout-utils";
import { loadKeypair, sendInstructionsOrSquadsV4 } from "./utils";

// HIP 149 Decision 4: permanently stop and reclaim the Advisory Council
// compensation fanout created by create-council-fanout.ts. Closing:
//   - sweeps any HNT still sitting in the fanout's own token account to the
//     owner's HNT ATA (creating it if needed);
//   - dequeues whatever distribution task is currently scheduled;
//   - closes the fanout account itself, refunding its rent to `rent_refund`
//     (the address recorded at creation time — see the fanout's own
//     `rentRefund` field, not necessarily the current owner).
//
// This is a one-way operation: there is no "un-close". If the intent is only
// to change members, the schedule, or pause temporarily, use
// update-council-fanout.ts instead.
//
// The fanout's `owner` (the governance multisig vault) must sign this. Pass
// `--multisig <governance multisig address>` to route it through Squads V4 as
// a proposal instead of trying to send it directly.
//
// This instruction bakes in the fanout's *current* next_task/next_pre_task
// (has_one-checked on-chain) at build time, which can go stale while a Squads
// proposal sits waiting for approval -- the cron can self-reschedule to a new
// next_task in the meantime. That makes execution fail on-chain (has_one
// mismatch) rather than corrupt anything, but the proposal is then
// permanently dead and must be rebuilt. Get proposals approved promptly; if
// one sits for a while, re-run this script and re-propose.
export async function run(args: any = process.argv) {
  const yarg = yargs(args).options({
    wallet: {
      alias: "k",
      describe: "Anchor wallet keypair (payer; proposer if using --multisig)",
      default: `${os.homedir()}/.config/solana/id.json`,
    },
    url: {
      alias: "u",
      default: "http://127.0.0.1:8899",
      describe: "The solana url",
    },
    miniFanout: {
      type: "string",
      required: true,
      describe: "Address of the mini fanout to close",
    },
    multisig: {
      type: "string",
      describe:
        "Address of the squads multisig to propose through. Required in practice, since the fanout owner is the governance multisig and must sign this.",
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

  const miniFanout = new PublicKey(argv.miniFanout);
  const miniFanoutAcc = await program.account.miniFanoutV0.fetch(miniFanout);

  const taskRentRefund = await resolveTaskRentRefund(
    tuktukProgram,
    miniFanoutAcc.nextTask,
    miniFanout,
    program.programId,
    wallet.publicKey
  );

  const ownerTokenAccount = getAssociatedTokenAddressSync(
    miniFanoutAcc.mint,
    miniFanoutAcc.owner,
    true
  );

  const closeIx = await program.methods
    .closeMiniFanoutV0()
    .accountsPartial({
      owner: miniFanoutAcc.owner,
      miniFanout,
      mint: miniFanoutAcc.mint,
      rentRefund: miniFanoutAcc.rentRefund,
      taskQueue: miniFanoutAcc.taskQueue,
      tokenAccount: miniFanoutAcc.tokenAccount,
      ownerTokenAccount,
      taskRentRefund,
    })
    .instruction();

  await sendInstructionsOrSquadsV4({
    provider,
    instructions: [closeIx],
    multisig: argv.multisig ? new PublicKey(argv.multisig) : undefined,
    signers: [],
  });

  console.log("Council fanout closed.");
  console.log(`  mini fanout:   ${miniFanout.toBase58()}`);
  console.log(`  HNT swept to:  ${ownerTokenAccount.toBase58()}`);
  console.log(`  rent refunded: ${miniFanoutAcc.rentRefund.toBase58()}`);
}
