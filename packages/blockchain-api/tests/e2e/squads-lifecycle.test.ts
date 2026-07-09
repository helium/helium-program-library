import { Keypair, LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import * as multisig from "@sqds/multisig";
import assert from "assert";
import { setupTestCtx, TestCtx } from "./helpers/context";
import { ensureFunds, loadKeypair2FromEnv } from "./helpers/wallet";
import { signAndSubmitTransactionData } from "./helpers/tx";
import { stopNextServer } from "./helpers/next";
import { stopSurfpool } from "./helpers/surfpool";

/**
 * Drives the Squads v4 proposal lifecycle endpoints against a freshly created
 * multisig on the mainnet fork:
 *
 *   proposeConfigChange -> rejectProposal              (proposal ends Rejected)
 *   proposeConfigChange -> approve x2 -> executeProposal (threshold actually changes)
 *   proposeConfigChange -> approve   -> cancelProposal   (proposal ends Cancelled)
 *
 * The multisig has two members (the two test wallets) so approve/reject/cancel
 * cutoffs can be reached deterministically. The vault-transaction execute path
 * is exercised once proposal-mode lands on the action endpoints; here execute
 * covers the config-transaction path.
 */
describe("squads v4 proposal lifecycle", function () {
  this.timeout(300_000);

  let ctx: TestCtx;
  let member2: Keypair;
  let multisigPda: PublicKey;

  const base58 = (k: PublicKey) => k.toBase58();

  async function proposalStatus(index: string): Promise<string> {
    const [proposalPda] = multisig.getProposalPda({
      multisigPda,
      transactionIndex: BigInt(index),
    });
    const proposal = await multisig.accounts.Proposal.fromAccountAddress(
      ctx.connection,
      proposalPda
    );
    return proposal.status.__kind;
  }

  async function currentThreshold(): Promise<number> {
    const ms = await multisig.accounts.Multisig.fromAccountAddress(
      ctx.connection,
      multisigPda
    );
    return ms.threshold;
  }

  async function proposeChangeThreshold(newThreshold: number): Promise<string> {
    const res = await ctx.client.squads.proposeConfigChange({
      member: base58(ctx.payer.publicKey),
      multisig: base58(multisigPda),
      actions: [{ type: "changeThreshold", newThreshold }],
    });
    await signAndSubmitTransactionData(ctx.connection, res, ctx.payer);
    return String(
      (res.actionMetadata as Record<string, unknown>).transactionIndex
    );
  }

  async function approve(index: string, signer: Keypair): Promise<void> {
    const res = await ctx.client.squads.approveProposal({
      member: base58(signer.publicKey),
      multisig: base58(multisigPda),
      transactionIndex: index,
    });
    await signAndSubmitTransactionData(ctx.connection, res, signer);
  }

  before(async () => {
    ctx = await setupTestCtx();
    member2 = loadKeypair2FromEnv();
    await ensureFunds(ctx.payer.publicKey, 0.2 * LAMPORTS_PER_SOL);
    await ensureFunds(member2.publicKey, 0.1 * LAMPORTS_PER_SOL);

    // Create a fresh 2-of-2 multisig on the fork so proposal cutoffs are
    // deterministic and we never touch a real mainnet multisig.
    const createKey = Keypair.generate();
    [multisigPda] = multisig.getMultisigPda({ createKey: createKey.publicKey });
    const [programConfigPda] = multisig.getProgramConfigPda({});
    const programConfig =
      await multisig.accounts.ProgramConfig.fromAccountAddress(
        ctx.connection,
        programConfigPda
      );

    await multisig.rpc.multisigCreateV2({
      connection: ctx.connection,
      treasury: programConfig.treasury,
      createKey,
      creator: ctx.payer,
      multisigPda,
      configAuthority: null,
      threshold: 2,
      members: [
        {
          key: ctx.payer.publicKey,
          permissions: multisig.types.Permissions.all(),
        },
        {
          key: member2.publicKey,
          permissions: multisig.types.Permissions.all(),
        },
      ],
      timeLock: 0,
      rentCollector: null,
      sendOptions: { skipPreflight: false },
    });

    let created = false;
    for (let i = 0; i < 30 && !created; i++) {
      created = (await ctx.connection.getAccountInfo(multisigPda)) !== null;
      if (!created) await new Promise((r) => setTimeout(r, 1000));
    }
    assert.ok(created, "multisig account was not created on the fork");
    assert.equal(
      await currentThreshold(),
      2,
      "multisig should start at 2-of-2"
    );
  });

  after(async () => {
    await stopNextServer();
    await stopSurfpool();
  });

  it("proposes a config change and rejects it", async () => {
    // 2-of-2: rejection cutoff is members - threshold + 1 = 1, so one reject
    // moves the proposal to Rejected.
    const index = await proposeChangeThreshold(1);

    const res = await ctx.client.squads.rejectProposal({
      member: base58(ctx.payer.publicKey),
      multisig: base58(multisigPda),
      transactionIndex: index,
    });
    await signAndSubmitTransactionData(ctx.connection, res, ctx.payer);

    assert.equal(await proposalStatus(index), "Rejected");
  });

  it("proposes, approves, and executes a config change", async () => {
    const index = await proposeChangeThreshold(1);

    await approve(index, ctx.payer);
    await approve(index, member2);
    assert.equal(await proposalStatus(index), "Approved");

    const res = await ctx.client.squads.executeProposal({
      member: base58(ctx.payer.publicKey),
      multisig: base58(multisigPda),
      transactionIndex: index,
    });
    assert.equal(
      (res.actionMetadata as Record<string, unknown>).kind,
      "config",
      "execute should detect a config transaction"
    );
    await signAndSubmitTransactionData(ctx.connection, res, ctx.payer);

    assert.equal(await proposalStatus(index), "Executed");
    assert.equal(await currentThreshold(), 1, "threshold should now be 1-of-2");
  });

  it("cancels an approved proposal", async () => {
    // threshold is now 1: one approve moves the proposal to Approved, and the
    // cancel cutoff (= threshold) is likewise 1.
    const index = await proposeChangeThreshold(2);

    await approve(index, ctx.payer);
    assert.equal(await proposalStatus(index), "Approved");

    const res = await ctx.client.squads.cancelProposal({
      member: base58(ctx.payer.publicKey),
      multisig: base58(multisigPda),
      transactionIndex: index,
    });
    await signAndSubmitTransactionData(ctx.connection, res, ctx.payer);

    assert.equal(await proposalStatus(index), "Cancelled");
  });
});
