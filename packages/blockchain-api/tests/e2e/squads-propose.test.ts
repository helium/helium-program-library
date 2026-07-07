import { Keypair, LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";
import { HNT_MINT } from "@helium/spl-utils";
import * as multisig from "@sqds/multisig";
import assert from "assert";
import { setupTestCtx, TestCtx } from "./helpers/context";
import {
  ensureFunds,
  ensureTokenBalance,
  loadKeypair2FromEnv,
} from "./helpers/wallet";
import { signAndSubmitTransactionData } from "./helpers/tx";

/**
 * Exercises the token-transfer endpoint's Squads propose mode end to end: the
 * transfer is built with the vault as the source authority, wrapped into a
 * vaultTransactionCreate + proposalCreate proposal, then approved and executed
 * so the vault actually pays out. This also covers executeProposal's
 * vault-transaction path (the config path is covered in squads-lifecycle).
 *
 * A 1-of-1 multisig keeps the flow to a single approve + execute by the payer.
 */
describe("squads v4 propose-mode (token transfer)", function () {
  this.timeout(300_000);

  let ctx: TestCtx;
  let recipient: Keypair;
  let multisigPda: PublicKey;
  let vault: PublicKey;

  const base58 = (k: PublicKey) => k.toBase58();

  async function hntBalance(owner: PublicKey): Promise<bigint> {
    const ata = getAssociatedTokenAddressSync(HNT_MINT, owner, true);
    const res = await ctx.connection
      .getTokenAccountBalance(ata)
      .catch(() => null);
    return res ? BigInt(res.value.amount) : BigInt(0);
  }

  before(async () => {
    ctx = await setupTestCtx();
    recipient = loadKeypair2FromEnv();
    await ensureFunds(ctx.payer.publicKey, 0.2 * LAMPORTS_PER_SOL);

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
      threshold: 1,
      members: [
        {
          key: ctx.payer.publicKey,
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

    vault = multisig.getVaultPda({ multisigPda, index: 0 })[0];
    // Fund the vault with HNT (+ a little SOL), and pre-create the recipient's
    // HNT ATA so the transfer needs no rent at execution time.
    await ensureFunds(vault, 0.05 * LAMPORTS_PER_SOL);
    await ensureTokenBalance(vault, HNT_MINT, 5);
    await ensureTokenBalance(recipient.publicKey, HNT_MINT, 1);
  });

  it("proposes, approves, and executes a transfer from the vault", async () => {
    const amount = "200000000"; // 2 HNT (8 decimals)
    const vaultBefore = await hntBalance(vault);
    const recipientBefore = await hntBalance(recipient.publicKey);

    const propose = await ctx.client.tokens.transfer({
      walletAddress: base58(ctx.payer.publicKey),
      destination: base58(recipient.publicKey),
      tokenAmount: { amount, mint: base58(HNT_MINT) },
      multisig: base58(multisigPda),
    });
    const meta = propose.transactionData.actionMetadata as Record<
      string,
      unknown
    >;
    assert.equal(meta.type, "token_transfer_proposal");
    await signAndSubmitTransactionData(
      ctx.connection,
      propose.transactionData,
      ctx.payer
    );
    const index = String(meta.transactionIndex);

    const approve = await ctx.client.squads.approveProposal({
      member: base58(ctx.payer.publicKey),
      multisig: base58(multisigPda),
      transactionIndex: index,
    });
    await signAndSubmitTransactionData(ctx.connection, approve, ctx.payer);

    const execute = await ctx.client.squads.executeProposal({
      member: base58(ctx.payer.publicKey),
      multisig: base58(multisigPda),
      transactionIndex: index,
    });
    assert.equal(
      (execute.actionMetadata as Record<string, unknown>).kind,
      "vault",
      "execute should detect a vault transaction"
    );
    await signAndSubmitTransactionData(ctx.connection, execute, ctx.payer);

    const [proposalPda] = multisig.getProposalPda({
      multisigPda,
      transactionIndex: BigInt(index),
    });
    const proposal = await multisig.accounts.Proposal.fromAccountAddress(
      ctx.connection,
      proposalPda
    );
    assert.equal(proposal.status.__kind, "Executed");

    const vaultAfter = await hntBalance(vault);
    const recipientAfter = await hntBalance(recipient.publicKey);
    assert.equal(
      (recipientAfter - recipientBefore).toString(),
      amount,
      "recipient should receive 2 HNT"
    );
    assert.equal(
      (vaultBefore - vaultAfter).toString(),
      amount,
      "vault should be debited 2 HNT"
    );
  });
});
