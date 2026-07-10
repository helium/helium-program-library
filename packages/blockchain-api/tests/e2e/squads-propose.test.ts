import { Keypair, LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";
import { DC_MINT, HNT_MINT, IOT_MINT } from "@helium/spl-utils";
import * as multisig from "@sqds/multisig";
import assert from "assert";
import { setupTestCtx, TestCtx } from "./helpers/context";
import {
  ensureFunds,
  ensureTokenBalance,
  loadKeypair2FromEnv,
} from "./helpers/wallet";
import { signAndSubmitTransactionData } from "./helpers/tx";
import { createTestMultisig } from "./helpers/squads";
import { TEST_HOTSPOT_ENTITY_KEY } from "./helpers/constants";
import { stopNextServer } from "./helpers/next";
import { stopSurfpool } from "./helpers/surfpool";

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

  async function tokenBalance(
    owner: PublicKey,
    mint: PublicKey
  ): Promise<bigint> {
    const ata = getAssociatedTokenAddressSync(mint, owner, true);
    const res = await ctx.connection
      .getTokenAccountBalance(ata)
      .catch(() => null);
    return res ? BigInt(res.value.amount) : BigInt(0);
  }

  const hntBalance = (owner: PublicKey) => tokenBalance(owner, HNT_MINT);

  /**
   * Sign+submit the proposal, then approve and execute it as the sole member
   * (1-of-1), asserting the proposal ends Executed. Returns nothing.
   */
  async function approveAndExecute(index: string): Promise<void> {
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
  }

  before(async () => {
    ctx = await setupTestCtx();
    recipient = loadKeypair2FromEnv();
    await ensureFunds(ctx.payer.publicKey, 0.2 * LAMPORTS_PER_SOL);

    multisigPda = await createTestMultisig({
      connection: ctx.connection,
      creator: ctx.payer,
      threshold: 1,
      members: [
        {
          key: ctx.payer.publicKey,
          permissions: multisig.types.Permissions.all(),
        },
      ],
    });

    vault = multisig.getVaultPda({ multisigPda, index: 0 })[0];
    // Fund the vault with HNT (+ a little SOL), and pre-create the recipient's
    // HNT ATA so the transfer needs no rent at execution time.
    await ensureFunds(vault, 0.05 * LAMPORTS_PER_SOL);
    await ensureTokenBalance(vault, HNT_MINT, 5);
    await ensureTokenBalance(recipient.publicKey, HNT_MINT, 1);
  });

  after(async () => {
    await stopNextServer();
    await stopSurfpool();
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

  it("proposes, approves, and executes a token burn from the vault", async () => {
    const amount = "100000000"; // 1 HNT
    const before = await hntBalance(vault);

    const propose = await ctx.client.tokens.burn({
      walletAddress: base58(ctx.payer.publicKey),
      tokenAmount: { amount, mint: base58(HNT_MINT) },
      multisig: base58(multisigPda),
    });
    const meta = propose.transactionData.actionMetadata as Record<
      string,
      unknown
    >;
    assert.equal(meta.type, "token_burn_proposal");
    await signAndSubmitTransactionData(
      ctx.connection,
      propose.transactionData,
      ctx.payer
    );
    await approveAndExecute(String(meta.transactionIndex));

    assert.equal(
      (before - (await hntBalance(vault))).toString(),
      amount,
      "vault HNT should be reduced by the burned amount"
    );
  });

  it("proposes, approves, and executes a DC burn from the vault", async () => {
    await ensureFunds(vault, 0.05 * LAMPORTS_PER_SOL);
    await ensureTokenBalance(vault, DC_MINT, 100); // DC has 0 decimals
    const amount = "10";
    const before = await tokenBalance(vault, DC_MINT);

    // dataCredits/burn returns the bare TransactionData (no envelope).
    const propose = await ctx.client.dataCredits.burn({
      owner: base58(ctx.payer.publicKey),
      amount,
      multisig: base58(multisigPda),
    });
    const meta = propose.actionMetadata as Record<string, unknown>;
    assert.equal(meta.type, "burn_data_credits_proposal");
    await signAndSubmitTransactionData(ctx.connection, propose, ctx.payer);
    await approveAndExecute(String(meta.transactionIndex));

    assert.equal(
      (before - (await tokenBalance(vault, DC_MINT))).toString(),
      amount,
      "vault DC should be reduced by the burned amount"
    );
  });

  it("proposes, approves, and executes a DC delegation from the vault", async () => {
    await ensureTokenBalance(vault, DC_MINT, 100);
    const dcBefore = await tokenBalance(vault, DC_MINT);
    const delegateAmount = "5";

    const propose = await ctx.client.dataCredits.delegate({
      owner: base58(ctx.payer.publicKey),
      routerKey: "test-router-squads",
      amount: delegateAmount,
      mint: base58(IOT_MINT),
      multisig: base58(multisigPda),
    });
    const meta = propose.actionMetadata as Record<string, unknown>;
    assert.equal(meta.type, "delegate_data_credits_proposal");
    await signAndSubmitTransactionData(ctx.connection, propose, ctx.payer);
    await approveAndExecute(String(meta.transactionIndex));

    assert.equal(
      (dcBefore - (await tokenBalance(vault, DC_MINT))).toString(),
      delegateAmount,
      "vault DC should be reduced by the delegated amount"
    );
  });

  // The cNFT propose happy path can't run on a fork (the vault would have to
  // actually own the hotspot per the real DAS index, which surfpool can't set
  // up). This negative case still confirms the propose-mode branch is reached
  // and the ownership guard compares against the vault rather than walletAddress.
  it("rejects a hotspot burn proposal when the vault does not own the hotspot", async () => {
    await assert.rejects(
      ctx.client.hotspots.burnHotspot({
        walletAddress: base58(ctx.payer.publicKey),
        hotspotPubkey: TEST_HOTSPOT_ENTITY_KEY,
        multisig: base58(multisigPda),
      }),
      (err: unknown) => {
        assert.match(String((err as Error)?.message ?? err), /owner/i);
        return true;
      }
    );
  });
});
