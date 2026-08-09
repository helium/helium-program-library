import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import { BankrunProvider } from "anchor-bankrun";
import { ProgramTestContext } from "solana-bankrun";
import { expect } from "chai";
import { MiniFanout } from "../target/types/mini_fanout";
import {
  ensureCloned,
  ensureDumped,
  overwriteAccountData,
  readAccount,
  startBankrun,
  warpBy,
} from "./utils/bankrun";

const MINI_FANOUT = new PublicKey("mfanLprNnaiP4RX9Zz1BMcDosYHCqnG24H1fMEbi9Gn");
const TUKTUK = new PublicKey("tuktukUrfhXT6ZT77QTU8RQtvgL967uRuVagWF57zVA");
// The queue mini-fanout runs on, cloned so a fanout can be created against real state.
const TASK_QUEUE = new PublicKey("H39gEszvsi6AT4rYBiJTuZHJSF5hMHy6CKGTd7wzhsg7");

describe("mini-fanout under bankrun", () => {
  let ctx: ProgramTestContext;
  let provider: BankrunProvider;
  let program: Program<MiniFanout>;
  let me: PublicKey;

  before(async () => {
    ensureDumped("tuktuk", TUKTUK);
    ctx = await startBankrun(
      [
        { name: "mini_fanout", programId: MINI_FANOUT },
        { name: "tuktuk", programId: TUKTUK },
      ],
      [ensureCloned("task_queue_h39", TASK_QUEUE)]
    );
    provider = new BankrunProvider(ctx);
    program = new Program<MiniFanout>(
      require("../target/idl/mini_fanout.json"),
      provider
    );
    me = provider.wallet.publicKey;
  });

  it("runs both programs against cloned mainnet state", async () => {
    for (const id of [MINI_FANOUT, TUKTUK]) {
      const account = await ctx.banksClient.getAccount(id);
      expect(account, id.toBase58()).to.not.be.null;
      expect(account!.executable, id.toBase58()).to.be.true;
    }
    const queue = await ctx.banksClient.getAccount(TASK_QUEUE);
    expect(queue).to.not.be.null;
    expect(new PublicKey(queue!.owner).toBase58()).to.equal(TUKTUK.toBase58());
  });

  it("moves the clock, so a timestamp trigger does not have to be waited for", async () => {
    const before = (await ctx.banksClient.getClock()).unixTimestamp;
    await warpBy(ctx, 86_400n);
    const after = (await ctx.banksClient.getClock()).unixTimestamp;
    expect(after - before).to.equal(86_400n);
  });

  it("rewrites an account the programs would not produce", async () => {
    // The capability the localnet suites lack. A guard that only fires on data a program
    // refuses to write is unreachable without this.
    const original = await readAccount(ctx, TASK_QUEUE);
    expect(original).to.not.be.null;

    const scrambled = Buffer.from(original!);
    scrambled[scrambled.length - 1] ^= 0xff;
    await overwriteAccountData(ctx, TASK_QUEUE, scrambled);

    const readBack = await readAccount(ctx, TASK_QUEUE);
    expect(readBack!.equals(scrambled)).to.be.true;
    expect(readBack!.equals(original!)).to.be.false;

    // Owner and executable survive the rewrite, or later instructions fail for the wrong reason.
    const account = await ctx.banksClient.getAccount(TASK_QUEUE);
    expect(new PublicKey(account!.owner).toBase58()).to.equal(TUKTUK.toBase58());

    await overwriteAccountData(ctx, TASK_QUEUE, original!);
    expect((await readAccount(ctx, TASK_QUEUE))!.equals(original!)).to.be.true;
  });

  it("reaches the program's own error path", async () => {
    // Proves the whole provider -> build -> sign -> execute path, not just construction:
    // the failure is the program's, at a named constraint.
    let message = "";
    try {
      await program.methods
        .initializeMiniFanoutV0({
          seed: Buffer.from("bankrun"),
          shares: [{ wallet: PublicKey.default, share: { share: { amount: 1 } } }],
          schedule: "0 0 * * * *",
          preTask: null,
        })
        .accounts({
          payer: me,
          owner: me,
          taskQueue: PublicKey.default,
          rentRefund: me,
          mint: PublicKey.default,
        })
        .rpc();
    } catch (e: any) {
      message = String(e.message ?? e);
    }
    expect(message).to.include("task_queue");
    expect(message).to.include("AccountOwnedByWrongProgram");
  });
});
