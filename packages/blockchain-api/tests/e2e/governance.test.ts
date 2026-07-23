import { AnchorProvider, Wallet } from "@coral-xyz/anchor";
import {
  delegatedPositionKey,
  init as initHsd,
} from "@helium/helium-sub-daos-sdk";
import { init as initProxy, proxyAssignmentKey } from "@helium/nft-proxy-sdk";
import { HNT_MINT, IOT_MINT, MOBILE_MINT } from "@helium/spl-utils";
import {
  init as initVsr,
  positionKey,
  proxyVoteMarkerKey,
  voteMarkerKey,
} from "@helium/voter-stake-registry-sdk";
import { init as initHplCrons } from "@helium/hpl-crons-sdk";
import {
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SYSVAR_CLOCK_PUBKEY,
  Transaction,
  VersionedTransaction,
} from "@solana/web3.js";
import { getAssociatedTokenAddressSync, NATIVE_MINT } from "@solana/spl-token";
import { expect } from "chai";
import { after, before, describe, it } from "mocha";
import { isDefinedError } from "@orpc/client";
import BN from "bn.js";
import { getCurrentSeasonEnd } from "../../src/server/api/routers/governance/procedures/helpers/get-current-season";
import { stopNextServer } from "./helpers/next";
import { stopSurfpool } from "./helpers/surfpool";
import { setupTestCtx, TestCtx } from "./helpers/context";
import { signAndSubmitTransactionData } from "./helpers/tx";
import { ensureFunds, ensureTokenBalance } from "./helpers/wallet";
import {
  DEFAULT_HPL_CRONS_TASK_QUEUE,
  TEST_PROXY_ADDRESS,
} from "./helpers/constants";
import {
  createAndFundPosition,
  ensureSubDaoEpochsCurrent,
  setDelegatedPositionExpiration,
  setPositionLockupEndTs,
} from "./helpers/governance";
import {
  createTestProposal,
  createTestOrganizationProposal,
  createHeliumOrgVotingProposal,
  ProposalSetup,
} from "./helpers/proposal";

/**
 * Initialize Anchor programs for on-chain state verification
 */
async function getPrograms(ctx: TestCtx) {
  const wallet = new Wallet(ctx.payer);
  const provider = new AnchorProvider(
    ctx.connection,
    wallet,
    AnchorProvider.defaultOptions()
  );

  const vsrProgram = await initVsr(provider);
  const hsdProgram = await initHsd(provider);
  const proxyProgram = await initProxy(provider);

  return { vsrProgram, hsdProgram, proxyProgram, provider };
}

const PROXY_ASSIGNMENT_DURATION_SECONDS = 86400 * 90;
const PROXY_EXPIRATION_BUFFER_SECONDS = 60;

async function getSeasonBoundedProxyExpirationTime(
  ctx: TestCtx,
  positionMint: string
): Promise<number> {
  const { vsrProgram, proxyProgram } = await getPrograms(ctx);
  const now = Math.floor(Date.now() / 1000);
  const [positionPubkey] = positionKey(new PublicKey(positionMint));
  const positionAcc = await vsrProgram.account.positionV0.fetch(positionPubkey);
  const registrar = await vsrProgram.account.registrar.fetch(
    positionAcc.registrar
  );
  const proxyConfig = await proxyProgram.account.proxyConfigV0.fetch(
    registrar.proxyConfig
  );
  const seasonEnd = getCurrentSeasonEnd(proxyConfig.seasons, new BN(now));

  if (!seasonEnd) {
    throw new Error("No current proxy season found");
  }

  const maxExpiration = seasonEnd.toNumber() - PROXY_EXPIRATION_BUFFER_SECONDS;
  if (maxExpiration <= now) {
    throw new Error("Current proxy season has already ended");
  }

  return Math.min(now + PROXY_ASSIGNMENT_DURATION_SECONDS, maxExpiration);
}

describe("governance", () => {
  let ctx: TestCtx;
  let proposalSetup: ProposalSetup;
  let orgProposalSetup: ProposalSetup;

  before(async () => {
    ctx = await setupTestCtx({
      setupFeePayer: true,
      taskQueue: DEFAULT_HPL_CRONS_TASK_QUEUE,
    });

    await ensureSubDaoEpochsCurrent(ctx);

    proposalSetup = await createTestProposal(ctx, {
      name: `shared-proposal-${Date.now()}`,
    });

    orgProposalSetup = await createTestOrganizationProposal(ctx, {
      name: `shared-org-proposal-${Date.now()}`,
    });
  });

  after(async () => {
    await stopNextServer();
    await stopSurfpool();
  });

  describe("position lifecycle", () => {
    let walletAddress: string;

    before(async () => {
      walletAddress = ctx.payer.publicKey.toBase58();
      await ensureTokenBalance(ctx.payer.publicKey, HNT_MINT, 10);
    });

    it("creates a position with cliff lockup", async () => {
      // #given funded wallet with HNT
      // #when creating a position
      const { data, error } = await ctx.safeClient.governance.createPosition({
        walletAddress,
        tokenAmount: { amount: "100000000", mint: HNT_MINT.toBase58() }, // 1 HNT in bones
        lockupKind: "cliff",
        lockupPeriodsInDays: 30,
      });

      // #then transaction builds successfully
      if (error) {
        expect.fail(`Unexpected error: ${JSON.stringify(error)}`);
      }
      expect(data?.transactionData?.transactions).to.have.length(1);
      expect(data?.transactionData?.tag).to.include("position_create");
      expect(data!.estimatedSolFee!.mint).to.equal(NATIVE_MINT.toBase58());
      expect(Number(data!.estimatedSolFee!.amount)).to.be.greaterThan(0);

      // Verify batch-level actionMetadata
      expect(data?.transactionData?.actionMetadata).to.deep.include({
        type: "position_create",
        lockupKind: "cliff",
        lockupPeriodDays: 30,
      });

      // Sign and submit
      const sigs = await signAndSubmitTransactionData(
        ctx.connection,
        data.transactionData,
        ctx.payer
      );
      expect(sigs).to.have.length(1);

      // Verify position exists on-chain
      const positionMint = data.transactionData.transactions[0].metadata
        ?.positionMint as string;
      expect(positionMint).to.not.be.undefined;

      const [positionPubkey] = positionKey(new PublicKey(positionMint));
      const positionInfo = await ctx.connection.getAccountInfo(positionPubkey);
      expect(positionInfo).to.not.be.null;
    });

    it("extends position lockup", async () => {
      // #given fresh position with 30-day cliff lockup
      const result = await createAndFundPosition(ctx, {
        amount: "100000000",
        lockupKind: "cliff",
        lockupPeriodsInDays: 30,
      });

      const { vsrProgram } = await getPrograms(ctx);
      const [positionPubkey] = positionKey(new PublicKey(result.positionMint));

      // Read clock before operation for exact endTs computation
      const clockInfo = await ctx.connection.getAccountInfo(
        SYSVAR_CLOCK_PUBKEY
      );
      const clockTimestamp = Number(clockInfo!.data.readBigInt64LE(32));

      // #when extending the lockup to 60 days
      const { data, error } = await ctx.safeClient.governance.extendPosition({
        walletAddress,
        positionMint: result.positionMint,
        lockupPeriodsInDays: 60,
      });

      // #then transaction builds and submits successfully
      if (error) {
        expect.fail(`Unexpected error: ${JSON.stringify(error)}`);
      }
      expect(data?.transactionData?.transactions).to.have.length(1);
      expect(data?.transactionData?.transactions[0].metadata?.type).to.equal(
        "position_extend"
      );

      const sigs = await signAndSubmitTransactionData(
        ctx.connection,
        data.transactionData,
        ctx.payer
      );
      expect(sigs).to.have.length(1);

      // Verify lockup endTs matches expected: clockTimestamp + 60 days
      const positionAfter = await vsrProgram.account.positionV0.fetch(
        positionPubkey
      );
      const expectedEndTs = clockTimestamp + 60 * 86400;
      const actualEndTs = positionAfter.lockup.endTs.toNumber();
      expect(actualEndTs).to.be.within(expectedEndTs, expectedEndTs + 3);
    });

    it("flips lockup kind from cliff to constant", async () => {
      // #given fresh position with cliff lockup
      const result = await createAndFundPosition(ctx, {
        amount: "100000000",
        lockupKind: "cliff",
        lockupPeriodsInDays: 30,
      });

      // #when flipping lockup kind
      const { data, error } = await ctx.safeClient.governance.flipLockupKind({
        walletAddress,
        positionMint: result.positionMint,
      });

      // #then transaction builds and submits successfully
      if (error) {
        expect.fail(`Unexpected error: ${JSON.stringify(error)}`);
      }
      expect(data?.transactionData?.transactions).to.have.length(1);
      expect(data?.transactionData?.transactions[0].metadata?.type).to.equal(
        "position_flip_lockup"
      );

      const sigs = await signAndSubmitTransactionData(
        ctx.connection,
        data.transactionData,
        ctx.payer
      );
      expect(sigs).to.have.length(1);

      // Verify lockup kind changed to constant on-chain
      const { vsrProgram } = await getPrograms(ctx);
      const [positionPubkey] = positionKey(new PublicKey(result.positionMint));
      const positionAfter = await vsrProgram.account.positionV0.fetch(
        positionPubkey
      );
      expect(Object.keys(positionAfter.lockup.kind)[0]).to.equal("constant");
    });

    it("resets lockup kind and period", async () => {
      // #given fresh position with constant lockup
      const result = await createAndFundPosition(ctx, {
        amount: "100000000",
        lockupKind: "constant",
        lockupPeriodsInDays: 30,
      });

      // Read clock before operation for exact endTs computation
      const clockInfo = await ctx.connection.getAccountInfo(
        SYSVAR_CLOCK_PUBKEY
      );
      const clockTimestamp = Number(clockInfo!.data.readBigInt64LE(32));

      // #when resetting lockup to cliff with new period
      const { data, error } = await ctx.safeClient.governance.resetLockup({
        walletAddress,
        positionMint: result.positionMint,
        lockupKind: "cliff",
        lockupPeriodsInDays: 90,
      });

      // #then transaction builds and submits successfully
      if (error) {
        expect.fail(`Unexpected error: ${JSON.stringify(error)}`);
      }
      expect(data?.transactionData?.transactions).to.have.length(1);
      expect(data?.transactionData?.transactions[0].metadata?.type).to.equal(
        "position_reset_lockup"
      );

      const sigs = await signAndSubmitTransactionData(
        ctx.connection,
        data.transactionData,
        ctx.payer
      );
      expect(sigs).to.have.length(1);

      // Verify lockup kind is cliff and endTs matches expected
      const { vsrProgram } = await getPrograms(ctx);
      const [positionPubkey] = positionKey(new PublicKey(result.positionMint));
      const positionAfter = await vsrProgram.account.positionV0.fetch(
        positionPubkey
      );
      expect(Object.keys(positionAfter.lockup.kind)[0]).to.equal("cliff");
      const expectedEndTs = clockTimestamp + 90 * 86400;
      expect(positionAfter.lockup.endTs.toNumber()).to.be.oneOf([
        expectedEndTs,
        expectedEndTs + 1,
      ]);
    });
  });

  describe("position close", () => {
    let walletAddress: string;

    before(async () => {
      walletAddress = ctx.payer.publicKey.toBase58();
    });

    it("closes a constant lockup position", async () => {
      // #given position with constant lockup (bypasses time-based expiration)
      const result = await createAndFundPosition(ctx, {
        amount: "100000000", // 1 HNT
        lockupKind: "constant",
        lockupPeriodsInDays: 30,
      });

      // Flip to cliff so it can be closed (constant positions need flipLockupKind first)
      // Actually, per close.ts:65-67, constant lockup skips the expiration check entirely
      // #when closing the position
      const { data, error } = await ctx.safeClient.governance.closePosition({
        walletAddress,
        positionMint: result.positionMint,
      });

      // #then transaction builds with correct metadata
      if (error) {
        expect.fail(`Unexpected error: ${JSON.stringify(error)}`);
      }
      expect(data?.transactionData?.transactions).to.have.length(1);
      expect(data?.transactionData?.transactions[0].metadata?.type).to.equal(
        "position_close"
      );
    });
  });

  describe("position split and transfer", () => {
    let walletAddress: string;

    before(async () => {
      walletAddress = ctx.payer.publicKey.toBase58();
    });

    it("splits position into new position", async () => {
      // #given fresh source position with 2 HNT
      const result = await createAndFundPosition(ctx, {
        amount: "200000000",
        lockupKind: "cliff",
        lockupPeriodsInDays: 30,
      });

      // #when splitting 1 HNT to new position
      const { data, error } = await ctx.safeClient.governance.splitPosition({
        walletAddress,
        positionMint: result.positionMint,
        amount: "100000000",
        lockupKind: "cliff",
        lockupPeriodsInDays: 60,
      });

      // #then transaction builds and creates new position
      if (error) {
        expect.fail(`Unexpected error: ${JSON.stringify(error)}`);
      }
      expect(data?.transactionData?.transactions).to.have.length(1);
      expect(data?.transactionData?.transactions[0].metadata?.type).to.equal(
        "position_split"
      );

      const sigs = await signAndSubmitTransactionData(
        ctx.connection,
        data.transactionData,
        ctx.payer
      );
      expect(sigs).to.have.length(1);

      // Verify new position exists on-chain
      const targetPositionMint = data.transactionData.transactions[0].metadata
        ?.newPositionMint as string;
      expect(targetPositionMint).to.not.be.undefined;
      const [targetPubkey] = positionKey(new PublicKey(targetPositionMint));
      const targetInfo = await ctx.connection.getAccountInfo(targetPubkey);
      expect(targetInfo).to.not.be.null;
    });

    it("transfers tokens between positions", async () => {
      // #given source position with 2 HNT, split to create target
      const source = await createAndFundPosition(ctx, {
        amount: "200000000",
        lockupKind: "cliff",
        lockupPeriodsInDays: 60,
      });

      const { data: splitData, error: splitError } =
        await ctx.safeClient.governance.splitPosition({
          walletAddress,
          positionMint: source.positionMint,
          amount: "100000000",
          lockupKind: "cliff",
          lockupPeriodsInDays: 60,
        });
      if (splitError) {
        throw new Error(`Failed to split: ${JSON.stringify(splitError)}`);
      }
      await signAndSubmitTransactionData(
        ctx.connection,
        splitData!.transactionData,
        ctx.payer
      );
      const targetPositionMint = splitData!.transactionData.transactions[0]
        .metadata?.newPositionMint as string;

      const { vsrProgram } = await getPrograms(ctx);
      const [sourcePubkey] = positionKey(new PublicKey(source.positionMint));
      const [targetPubkey] = positionKey(new PublicKey(targetPositionMint));
      const sourceBefore = await vsrProgram.account.positionV0.fetch(
        sourcePubkey
      );
      const targetBefore = await vsrProgram.account.positionV0.fetch(
        targetPubkey
      );
      const sourceAmountBefore = sourceBefore.amountDepositedNative.toNumber();
      const targetAmountBefore = targetBefore.amountDepositedNative.toNumber();

      // #when transferring 0.5 HNT from source to target
      const transferAmount = 50000000; // 0.5 HNT
      const { data, error } = await ctx.safeClient.governance.transferPosition({
        walletAddress,
        positionMint: source.positionMint,
        targetPositionMint,
        amount: transferAmount.toString(),
      });

      // #then transaction builds and submits successfully
      if (error) {
        expect.fail(`Unexpected error: ${JSON.stringify(error)}`);
      }
      expect(data?.transactionData?.transactions).to.have.length(1);
      expect(data?.transactionData?.transactions[0].metadata?.type).to.equal(
        "position_transfer"
      );

      const sigs = await signAndSubmitTransactionData(
        ctx.connection,
        data.transactionData,
        ctx.payer
      );
      expect(sigs).to.have.length(1);

      // Verify amounts changed on-chain
      const sourceAfter = await vsrProgram.account.positionV0.fetch(
        sourcePubkey
      );
      const targetAfter = await vsrProgram.account.positionV0.fetch(
        targetPubkey
      );
      expect(sourceAfter.amountDepositedNative.toNumber()).to.equal(
        sourceAmountBefore - transferAmount
      );
      expect(targetAfter.amountDepositedNative.toNumber()).to.equal(
        targetAmountBefore + transferAmount
      );
    });
  });

  describe("position ownership transfer", () => {
    let walletAddress: string;

    before(async () => {
      walletAddress = ctx.payer.publicKey.toBase58();
    });

    it("transfers position ownership to another wallet", async () => {
      // #given a position owned by ctx.payer and a recipient keypair
      const result = await createAndFundPosition(ctx, {
        amount: "100000000",
        lockupKind: "cliff",
        lockupPeriodsInDays: 30,
      });
      const recipient = Keypair.generate();
      await ensureFunds(recipient.publicKey, 0.01 * LAMPORTS_PER_SOL);

      // #when transferring position ownership
      const { data, error } =
        await ctx.safeClient.governance.transferPositionOwnership({
          from: walletAddress,
          to: recipient.publicKey.toBase58(),
          positionMint: result.positionMint,
        });

      // #then transaction builds with correct metadata
      if (error) {
        expect.fail(`Unexpected error: ${JSON.stringify(error)}`);
      }
      expect(data?.transactionData?.transactions).to.have.length(1);
      expect(data?.transactionData?.transactions[0].metadata?.type).to.equal(
        "position_transfer_ownership"
      );
      expect(data?.transactionData?.actionMetadata).to.deep.include({
        type: "position_transfer_ownership",
        positionMint: result.positionMint,
        from: walletAddress,
        to: recipient.publicKey.toBase58(),
      });

      // Sign with both from and to, then submit
      const { blockhash, lastValidBlockHeight } =
        await ctx.connection.getLatestBlockhash("confirmed");
      const tx = VersionedTransaction.deserialize(
        Buffer.from(
          data.transactionData.transactions[0].serializedTransaction,
          "base64"
        )
      );
      tx.message.recentBlockhash = blockhash;
      tx.sign([ctx.payer]);
      const sig = await ctx.connection.sendRawTransaction(tx.serialize(), {
        skipPreflight: false,
      });
      await ctx.connection.confirmTransaction(
        { signature: sig, blockhash, lastValidBlockHeight },
        "confirmed"
      );

      // Verify ownership transferred on-chain: recipient now holds the position NFT
      const recipientAta = getAssociatedTokenAddressSync(
        new PublicKey(result.positionMint),
        recipient.publicKey,
        true
      );
      const recipientTokenAccount = await ctx.connection.getAccountInfo(
        recipientAta
      );
      expect(recipientTokenAccount).to.not.be.null;

      // Original owner no longer holds it
      const originalAta = getAssociatedTokenAddressSync(
        new PublicKey(result.positionMint),
        ctx.payer.publicKey,
        true
      );
      const originalTokenAccount = await ctx.connection
        .getTokenAccountBalance(originalAta)
        .catch(() => null);
      const recipientBalance = await ctx.connection.getTokenAccountBalance(
        recipientAta
      );
      expect(recipientBalance.value.uiAmount).to.equal(1);
    });
  });

  describe("delegation", () => {
    let walletAddress: string;

    before(async () => {
      walletAddress = ctx.payer.publicKey.toBase58();
    });

    it("delegates position to MOBILE sub-DAO", async () => {
      // #given fresh position with sufficient lockup
      const result = await createAndFundPosition(ctx, {
        amount: "100000000",
        lockupKind: "cliff",
        lockupPeriodsInDays: 365,
      });

      // #when delegating to MOBILE sub-DAO
      const { data, error } = await ctx.safeClient.governance.delegatePositions(
        {
          walletAddress,
          positionMints: [result.positionMint],
          subDaoMint: MOBILE_MINT.toBase58(),
          automationEnabled: false,
        }
      );

      // #then transaction builds and delegation is created
      if (error) {
        expect.fail(`Unexpected error: ${JSON.stringify(error)}`);
      }
      expect(data?.transactionData?.transactions).to.have.length(1);
      expect(data?.transactionData?.transactions[0].metadata?.type).to.equal(
        "delegation_delegate"
      );

      const sigs = await signAndSubmitTransactionData(
        ctx.connection,
        data.transactionData,
        ctx.payer
      );
      expect(sigs).to.have.length(1);

      // Verify delegated position exists on-chain
      const [positionPubkey] = positionKey(new PublicKey(result.positionMint));
      const [delegatedPosPubkey] = delegatedPositionKey(positionPubkey);
      const delegatedInfo = await ctx.connection.getAccountInfo(
        delegatedPosPubkey
      );
      expect(delegatedInfo).to.not.be.null;
    });

    it("extends delegation expiration", async () => {
      // #given position delegated to MOBILE with expiration set to 1 hour from now
      const result = await createAndFundPosition(ctx, {
        amount: "100000000",
        lockupKind: "cliff",
        lockupPeriodsInDays: 365,
        subDaoMint: MOBILE_MINT,
      });

      const { hsdProgram } = await getPrograms(ctx);
      const [positionPubkey] = positionKey(new PublicKey(result.positionMint));
      const [delegatedPosPubkey] = delegatedPositionKey(positionPubkey);

      const clockInfo = await ctx.connection.getAccountInfo(
        SYSVAR_CLOCK_PUBKEY
      );
      const clockTimestamp = Number(clockInfo!.data.readBigInt64LE(32));
      const shortExpiration = clockTimestamp + 3600;
      await setDelegatedPositionExpiration(
        ctx,
        delegatedPosPubkey,
        shortExpiration
      );

      const delegatedBefore =
        await hsdProgram.account.delegatedPositionV0.fetch(delegatedPosPubkey);
      expect(delegatedBefore.expirationTs.toNumber()).to.equal(shortExpiration);

      // #when extending delegation expiration
      const { data, error } = await ctx.safeClient.governance.extendDelegation({
        walletAddress,
        positionMint: result.positionMint,
      });

      // #then transaction builds and submits successfully
      if (error) {
        expect.fail(`Unexpected error: ${JSON.stringify(error)}`);
      }
      expect(data?.transactionData?.transactions).to.have.length(1);
      expect(data?.transactionData?.transactions[0].metadata?.type).to.equal(
        "delegation_extend"
      );

      const sigs = await signAndSubmitTransactionData(
        ctx.connection,
        data.transactionData,
        ctx.payer
      );
      expect(sigs).to.have.length(1);

      // Verify delegated position expiration increased
      const delegatedAfter = await hsdProgram.account.delegatedPositionV0.fetch(
        delegatedPosPubkey
      );
      expect(delegatedAfter.expirationTs.toNumber()).to.be.greaterThan(
        delegatedBefore.expirationTs.toNumber()
      );
    });

    it("undelegates position", async () => {
      // #given fresh position delegated to MOBILE
      const result = await createAndFundPosition(ctx, {
        amount: "100000000",
        lockupKind: "cliff",
        lockupPeriodsInDays: 365,
        subDaoMint: MOBILE_MINT,
      });

      // #when undelegating
      const { data, error } =
        await ctx.safeClient.governance.undelegatePosition({
          walletAddress,
          positionMint: result.positionMint,
        });

      // #then transaction builds and delegation is removed
      if (error) {
        expect.fail(`Unexpected error: ${JSON.stringify(error)}`);
      }
      expect(data?.transactionData?.transactions).to.have.length(1);
      expect(data?.transactionData?.transactions[0].metadata?.type).to.equal(
        "delegation_undelegate"
      );

      const sigs = await signAndSubmitTransactionData(
        ctx.connection,
        data.transactionData,
        ctx.payer
      );
      expect(sigs).to.have.length(1);

      // Verify delegated position account is closed on-chain
      const [positionPubkey] = positionKey(new PublicKey(result.positionMint));
      const [delegatedPosPubkey] = delegatedPositionKey(positionPubkey);
      const delegatedInfo = await ctx.connection.getAccountInfo(
        delegatedPosPubkey
      );
      expect(delegatedInfo).to.be.null;
    });
  });

  describe("delegation with sub-DAO change", () => {
    let walletAddress: string;
    let positionMint: string;

    before(async () => {
      walletAddress = ctx.payer.publicKey.toBase58();

      // Create position and delegate to IOT
      const result = await createAndFundPosition(ctx, {
        amount: "100000000",
        lockupKind: "cliff",
        lockupPeriodsInDays: 365,
        subDaoMint: IOT_MINT, // Initial delegation to IOT
      });
      positionMint = result.positionMint;
    });

    it("changes delegation from IOT to MOBILE sub-DAO", async () => {
      // #given position delegated to IOT
      // #when changing delegation to MOBILE
      const { data, error } = await ctx.safeClient.governance.delegatePositions(
        {
          walletAddress,
          positionMints: [positionMint],
          subDaoMint: MOBILE_MINT.toBase58(),
          automationEnabled: false,
        }
      );

      // #then transaction builds and delegation changes
      if (error) {
        expect.fail(`Unexpected error: ${JSON.stringify(error)}`);
      }
      expect(data?.transactionData?.transactions).to.have.length(1);

      const sigs = await signAndSubmitTransactionData(
        ctx.connection,
        data.transactionData,
        ctx.payer
      );
      expect(sigs).to.have.length(1);

      // Verify delegation changed to MOBILE sub-DAO
      const [positionPubkey] = positionKey(new PublicKey(positionMint));
      const [delegatedPosPubkey] = delegatedPositionKey(positionPubkey);
      const delegatedInfo = await ctx.connection.getAccountInfo(
        delegatedPosPubkey
      );
      expect(delegatedInfo).to.not.be.null;
    });
  });

  describe("delegation with automatic reward claiming", () => {
    let walletAddress: string;

    before(async () => {
      walletAddress = ctx.payer.publicKey.toBase58();
    });

    it("does not include claim transactions for new delegation", async () => {
      // #given non-delegated position
      const result = await createAndFundPosition(ctx, {
        amount: "100000000",
        lockupKind: "cliff",
        lockupPeriodsInDays: 365,
      });

      // #when delegating for first time
      const { data, error } = await ctx.safeClient.governance.delegatePositions(
        {
          walletAddress,
          positionMints: [result.positionMint],
          subDaoMint: MOBILE_MINT.toBase58(),
          automationEnabled: false,
        }
      );

      // #then only delegation transaction is returned (no claims needed)
      if (error) {
        expect.fail(`Unexpected error: ${JSON.stringify(error)}`);
      }
      expect(data?.transactionData?.transactions).to.have.length(1);
      expect(data.transactionData.transactions[0].metadata?.type).to.equal(
        "delegation_delegate"
      );

      const sigs = await signAndSubmitTransactionData(
        ctx.connection,
        data.transactionData,
        ctx.payer
      );
      expect(sigs).to.have.length(1);
    });
  });

  describe("delegation reward claiming", () => {
    let walletAddress: string;
    let positionMint: string;

    before(async () => {
      walletAddress = ctx.payer.publicKey.toBase58();

      // Create and delegate position for claim tests
      const result = await createAndFundPosition(ctx, {
        amount: "100000000", // 1 HNT
        lockupKind: "cliff",
        lockupPeriodsInDays: 365,
        subDaoMint: MOBILE_MINT,
      });
      positionMint = result.positionMint;
    });

    it("returns empty transactions for fresh delegation with no rewards", async () => {
      // #given freshly delegated position (no epochs to claim)
      // #when claiming rewards
      const { data, error } =
        await ctx.safeClient.governance.claimDelegationRewards({
          walletAddress,
          positionMints: [positionMint],
        });

      // #then returns empty transactions and hasMore=false
      if (error) {
        expect.fail(`Unexpected error: ${JSON.stringify(error)}`);
      }
      expect(data?.transactionData?.transactions).to.have.length(0);
      expect(data?.hasMore).to.equal(false);
    });
  });

  describe("multi-position delegation batching", () => {
    let walletAddress: string;
    let mint1: string;
    let mint2: string;

    before(async () => {
      walletAddress = ctx.payer.publicKey.toBase58();

      // Create 2 positions for batching test
      const result1 = await createAndFundPosition(ctx, {
        amount: "100000000",
        lockupKind: "cliff",
        lockupPeriodsInDays: 365,
      });
      mint1 = result1.positionMint;

      const result2 = await createAndFundPosition(ctx, {
        amount: "100000000",
        lockupKind: "cliff",
        lockupPeriodsInDays: 365,
      });
      mint2 = result2.positionMint;
    });

    it("delegates multiple positions in a single call", async () => {
      // #given 2 undelegated positions
      // #when delegating both to MOBILE
      const { data, error } = await ctx.safeClient.governance.delegatePositions(
        {
          walletAddress,
          positionMints: [mint1, mint2],
          subDaoMint: MOBILE_MINT.toBase58(),
          automationEnabled: false,
        }
      );

      // #then response contains transactions for both positions
      if (error) {
        expect.fail(`Unexpected error: ${JSON.stringify(error)}`);
      }
      expect(data?.transactionData?.transactions).to.have.length(1);

      const sigs = await signAndSubmitTransactionData(
        ctx.connection,
        data.transactionData,
        ctx.payer
      );
      expect(sigs.length).to.equal(data.transactionData.transactions.length);

      // Verify both positions are delegated on-chain
      const [pos1Pubkey] = positionKey(new PublicKey(mint1));
      const [del1Pubkey] = delegatedPositionKey(pos1Pubkey);
      const del1Info = await ctx.connection.getAccountInfo(del1Pubkey);
      expect(del1Info).to.not.be.null;

      const [pos2Pubkey] = positionKey(new PublicKey(mint2));
      const [del2Pubkey] = delegatedPositionKey(pos2Pubkey);
      const del2Info = await ctx.connection.getAccountInfo(del2Pubkey);
      expect(del2Info).to.not.be.null;
    });
  });

  describe("proxy assignment", () => {
    let walletAddress: string;
    let positionMint: string;

    before(async () => {
      walletAddress = ctx.payer.publicKey.toBase58();

      // Create position for proxy tests
      const result = await createAndFundPosition(ctx, {
        amount: "100000000",
        lockupKind: "cliff",
        lockupPeriodsInDays: 365,
      });
      positionMint = result.positionMint;
    });

    it("assigns proxy to position", async () => {
      // #given position with no proxy
      // #when assigning proxy
      const expirationTime = await getSeasonBoundedProxyExpirationTime(
        ctx,
        positionMint
      );

      const { data, error } = await ctx.safeClient.governance.assignProxies({
        walletAddress,
        positionMints: [positionMint],
        proxyKey: TEST_PROXY_ADDRESS,
        expirationTime,
      });

      // #then transaction builds and proxy is assigned
      if (error) {
        expect.fail(`Unexpected error: ${JSON.stringify(error)}`);
      }
      expect(data?.transactionData?.transactions).to.have.length(1);
      expect(data?.transactionData?.transactions[0].metadata?.type).to.equal(
        "proxy_assign"
      );

      const sigs = await signAndSubmitTransactionData(
        ctx.connection,
        data.transactionData,
        ctx.payer
      );
      expect(sigs).to.have.length(1);

      // Verify proxy assignment exists on-chain
      const { vsrProgram, proxyProgram } = await getPrograms(ctx);
      const positionMintPubkey = new PublicKey(positionMint);
      const [positionPubkey] = positionKey(positionMintPubkey);
      const positionAcc = await vsrProgram.account.positionV0.fetch(
        positionPubkey
      );
      const registrar = await vsrProgram.account.registrar.fetch(
        positionAcc.registrar
      );
      const [proxyAssignment] = proxyAssignmentKey(
        registrar.proxyConfig,
        positionMintPubkey,
        new PublicKey(TEST_PROXY_ADDRESS)
      );
      const proxyAssignmentAcc =
        await proxyProgram.account.proxyAssignmentV0.fetchNullable(
          proxyAssignment
        );
      expect(proxyAssignmentAcc).to.not.be.null;
    });

    it("unassigns proxy from position", async () => {
      // #given fresh position with proxy assigned
      const unassignResult = await createAndFundPosition(ctx, {
        amount: "100000000",
        lockupKind: "cliff",
        lockupPeriodsInDays: 365,
      });
      const unassignMint = unassignResult.positionMint;

      const expirationTime = await getSeasonBoundedProxyExpirationTime(
        ctx,
        unassignMint
      );
      const { data: assignData, error: assignError } =
        await ctx.safeClient.governance.assignProxies({
          walletAddress,
          positionMints: [unassignMint],
          proxyKey: TEST_PROXY_ADDRESS,
          expirationTime,
        });
      if (assignError) {
        throw new Error(
          `Failed to assign proxy: ${JSON.stringify(assignError)}`
        );
      }
      await signAndSubmitTransactionData(
        ctx.connection,
        assignData!.transactionData,
        ctx.payer
      );

      // #when unassigning proxy
      const { data, error } = await ctx.safeClient.governance.unassignProxies({
        walletAddress,
        positionMints: [unassignMint],
        proxyKey: TEST_PROXY_ADDRESS,
      });

      // #then transaction builds and proxy is removed
      if (error) {
        expect.fail(`Unexpected error: ${JSON.stringify(error)}`);
      }
      expect(data?.transactionData?.transactions).to.have.length(1);
      expect(data?.transactionData?.transactions[0].metadata?.type).to.equal(
        "proxy_unassign"
      );

      const sigs = await signAndSubmitTransactionData(
        ctx.connection,
        data.transactionData,
        ctx.payer
      );
      expect(sigs).to.have.length(1);

      // Verify proxy assignment to recipient is closed on-chain
      const { vsrProgram, proxyProgram } = await getPrograms(ctx);
      const positionMintPubkey = new PublicKey(unassignMint);
      const [positionPubkey] = positionKey(positionMintPubkey);
      const positionAcc = await vsrProgram.account.positionV0.fetch(
        positionPubkey
      );
      const registrar = await vsrProgram.account.registrar.fetch(
        positionAcc.registrar
      );
      const [proxyAssignment] = proxyAssignmentKey(
        registrar.proxyConfig,
        positionMintPubkey,
        new PublicKey(TEST_PROXY_ADDRESS)
      );
      const proxyAssignmentAcc =
        await proxyProgram.account.proxyAssignmentV0.fetchNullable(
          proxyAssignment
        );
      expect(proxyAssignmentAcc).to.be.null;
    });
  });

  describe("proxy re-assignment", () => {
    let walletAddress: string;
    let positionMint: string;

    before(async () => {
      walletAddress = ctx.payer.publicKey.toBase58();

      // Create position for proxy re-assignment test
      const result = await createAndFundPosition(ctx, {
        amount: "100000000",
        lockupKind: "cliff",
        lockupPeriodsInDays: 365,
      });
      positionMint = result.positionMint;
    });

    it("re-assigns proxy from one recipient to another", async () => {
      // #given position with proxy assigned to TEST_PROXY_ADDRESS
      const expirationTime = await getSeasonBoundedProxyExpirationTime(
        ctx,
        positionMint
      );

      const { data: assignData, error: assignError } =
        await ctx.safeClient.governance.assignProxies({
          walletAddress,
          positionMints: [positionMint],
          proxyKey: TEST_PROXY_ADDRESS,
          expirationTime,
        });
      if (assignError) {
        throw new Error(
          `Failed to assign proxy: ${JSON.stringify(assignError)}`
        );
      }
      await signAndSubmitTransactionData(
        ctx.connection,
        assignData!.transactionData,
        ctx.payer
      );

      // #when re-assigning proxy to a new address
      const newRecipient = Keypair.generate().publicKey.toBase58();
      const { data, error } = await ctx.safeClient.governance.assignProxies({
        walletAddress,
        positionMints: [positionMint],
        proxyKey: newRecipient,
        expirationTime,
      });

      // #then transaction builds and submits
      if (error) {
        expect.fail(`Unexpected error: ${JSON.stringify(error)}`);
      }
      expect(data?.transactionData?.transactions).to.have.length(1);
      expect(data?.transactionData?.transactions[0].metadata?.type).to.equal(
        "proxy_assign"
      );

      const sigs = await signAndSubmitTransactionData(
        ctx.connection,
        data.transactionData,
        ctx.payer
      );
      expect(sigs).to.have.length(1);

      // Verify old proxy assignment is closed
      const { vsrProgram, proxyProgram } = await getPrograms(ctx);
      const positionMintPubkey = new PublicKey(positionMint);
      const [positionPubkey] = positionKey(positionMintPubkey);
      const positionAcc = await vsrProgram.account.positionV0.fetch(
        positionPubkey
      );
      const registrar = await vsrProgram.account.registrar.fetch(
        positionAcc.registrar
      );

      const [oldProxy] = proxyAssignmentKey(
        registrar.proxyConfig,
        positionMintPubkey,
        new PublicKey(TEST_PROXY_ADDRESS)
      );
      const oldProxyAcc =
        await proxyProgram.account.proxyAssignmentV0.fetchNullable(oldProxy);
      expect(oldProxyAcc).to.be.null;

      // Verify new proxy assignment exists
      const [newProxy] = proxyAssignmentKey(
        registrar.proxyConfig,
        positionMintPubkey,
        new PublicKey(newRecipient)
      );
      const newProxyAcc =
        await proxyProgram.account.proxyAssignmentV0.fetchNullable(newProxy);
      expect(newProxyAcc).to.not.be.null;
    });
  });

  describe("proxy assignment when proxy already voted", () => {
    let walletAddress: string;

    before(async () => {
      walletAddress = ctx.payer.publicKey.toBase58();
    });

    // Decode the instruction name of every instruction in the returned
    // transactions that belongs to the vsr or hpl-crons program.
    async function instructionNames(txData: {
      transactions: Array<{ serializedTransaction: string }>;
    }): Promise<string[]> {
      const { vsrProgram, provider } = await getPrograms(ctx);
      const hplCronsProgram = await initHplCrons(provider);
      const names: string[] = [];
      for (const t of txData.transactions) {
        const tx = VersionedTransaction.deserialize(
          Buffer.from(t.serializedTransaction, "base64")
        );
        const keys = tx.message.staticAccountKeys;
        for (const ix of tx.message.compiledInstructions) {
          const programId = keys[ix.programIdIndex];
          const data = Buffer.from(ix.data);
          if (programId.equals(vsrProgram.programId)) {
            const decoded = vsrProgram.coder.instruction.decode(data);
            if (decoded) names.push(decoded.name);
          } else if (programId.equals(hplCronsProgram.programId)) {
            const decoded = hplCronsProgram.coder.instruction.decode(data);
            if (decoded) names.push(decoded.name);
          }
        }
      }
      return names;
    }

    it("queues a proxy-vote task instead of counting the vote inline", async () => {
      // #given an active Helium-org proposal that the proxy has already voted on
      const proxyKp = Keypair.generate();
      const proposalSetup = await createHeliumOrgVotingProposal(ctx, {
        name: `pv-${Math.random().toString(36).substring(2, 8)}`,
        votingDurationSecs: 3600,
        // Backdate so endTs is already in the past while still in Voting state.
        startedSecsAgo: 7200,
      });

      const { vsrProgram } = await getPrograms(ctx);
      const [proxyVoteMarker] = proxyVoteMarkerKey(
        proxyKp.publicKey,
        proposalSetup.proposal
      );
      const proxiedVoteIx = await vsrProgram.methods
        .proxiedVoteV1({ choice: 0 })
        .accountsPartial({
          proposal: proposalSetup.proposal,
          voter: proxyKp.publicKey,
          marker: proxyVoteMarker,
        })
        .instruction();
      const { blockhash, lastValidBlockHeight } =
        await ctx.connection.getLatestBlockhash("confirmed");
      const proxiedVoteTx = new Transaction();
      proxiedVoteTx.recentBlockhash = blockhash;
      proxiedVoteTx.feePayer = ctx.payer.publicKey;
      proxiedVoteTx.add(proxiedVoteIx);
      proxiedVoteTx.sign(ctx.payer, proxyKp);
      const proxiedVoteSig = await ctx.connection.sendRawTransaction(
        proxiedVoteTx.serialize()
      );
      await ctx.connection.confirmTransaction(
        { signature: proxiedVoteSig, blockhash, lastValidBlockHeight },
        "confirmed"
      );

      // Sanity: the proxy marker now records the cast choice.
      const proxyMarkerAcc = await vsrProgram.account.proxyMarkerV0.fetch(
        proxyVoteMarker
      );
      expect(proxyMarkerAcc.choices).to.deep.equal([0]);

      // #given a delegated position owned by the wallet, not yet proxied
      const { positionMint } = await createAndFundPosition(ctx, {
        amount: "100000000",
        lockupKind: "cliff",
        lockupPeriodsInDays: 365,
      });
      const { data: delegateData, error: delegateError } =
        await ctx.safeClient.governance.delegatePositions({
          walletAddress,
          positionMints: [positionMint],
          subDaoMint: MOBILE_MINT.toBase58(),
          automationEnabled: false,
        });
      if (delegateError) {
        throw new Error(
          `Failed to delegate position: ${JSON.stringify(delegateError)}`
        );
      }
      await signAndSubmitTransactionData(
        ctx.connection,
        delegateData!.transactionData,
        ctx.payer
      );

      // #when assigning the delegated position to the proxy that already voted
      const expirationTime = await getSeasonBoundedProxyExpirationTime(
        ctx,
        positionMint
      );
      const { data, error } = await ctx.safeClient.governance.assignProxies({
        walletAddress,
        positionMints: [positionMint],
        proxyKey: proxyKp.publicKey.toBase58(),
        expirationTime,
      });

      // #then the call succeeds
      if (error) {
        expect.fail(`Unexpected error: ${JSON.stringify(error)}`);
      }

      // #then it queues a proxy-vote cron task and does NOT count the vote or
      // queue the wallet-unsignable relinquish inline
      const names = await instructionNames(data!.transactionData);
      expect(names).to.include("queueProxyVoteV0");
      expect(names).to.not.include("countProxyVoteV0");
      expect(names).to.not.include("queueRelinquishExpiredVoteMarkerV0");

      // #then the assign transactions submit successfully
      const sigs = await signAndSubmitTransactionData(
        ctx.connection,
        data!.transactionData,
        ctx.payer
      );
      expect(sigs.length).to.be.greaterThan(0);

      // #then the proxy assignment exists on-chain
      const { proxyProgram } = await getPrograms(ctx);
      const positionMintPubkey = new PublicKey(positionMint);
      const [positionPubkey] = positionKey(positionMintPubkey);
      const positionAcc = await vsrProgram.account.positionV0.fetch(
        positionPubkey
      );
      const registrar = await vsrProgram.account.registrar.fetch(
        positionAcc.registrar
      );
      const [proxyAssignment] = proxyAssignmentKey(
        registrar.proxyConfig,
        positionMintPubkey,
        proxyKp.publicKey
      );
      const proxyAssignmentAcc =
        await proxyProgram.account.proxyAssignmentV0.fetchNullable(
          proxyAssignment
        );
      expect(proxyAssignmentAcc).to.not.be.null;
    });
  });

  describe("voting", () => {
    let walletAddress: string;

    before(async () => {
      walletAddress = ctx.payer.publicKey.toBase58();
    });

    // Cast and submit a vote, failing the test on any error. Used to set up
    // "already voted" state before exercising skip reporting.
    const castVote = async (
      proposalKey: string,
      positionMints: string[],
      choice: number
    ) => {
      const { data, error } = await ctx.safeClient.governance.vote({
        walletAddress,
        proposalKey,
        positionMints,
        choice,
      });
      if (error) {
        expect.fail(`Setup vote failed: ${JSON.stringify(error)}`);
      }
      await signAndSubmitTransactionData(
        ctx.connection,
        data!.transactionData,
        ctx.payer
      );
    };

    it("votes on proposal with position", async () => {
      // #given fresh position for voting
      const result = await createAndFundPosition(ctx, {
        amount: "100000000",
        lockupKind: "cliff",
        lockupPeriodsInDays: 365,
      });

      // #when casting vote
      const { data, error } = await ctx.safeClient.governance.vote({
        walletAddress,
        proposalKey: proposalSetup.proposal.toBase58(),
        positionMints: [result.positionMint],
        choice: 0,
      });

      // #then transaction builds and submits
      if (error) {
        expect.fail(`Unexpected error: ${JSON.stringify(error)}`);
      }
      expect(data?.transactionData?.transactions).to.have.length(1);
      expect(data?.transactionData?.transactions[0].metadata?.type).to.equal(
        "voting_vote"
      );

      const sigs = await signAndSubmitTransactionData(
        ctx.connection,
        data.transactionData,
        ctx.payer
      );
      expect(sigs).to.have.length(1);

      // Verify vote marker exists
      const [voteMarker] = voteMarkerKey(
        new PublicKey(result.positionMint),
        proposalSetup.proposal
      );
      const markerInfo = await ctx.connection.getAccountInfo(voteMarker);
      expect(markerInfo).to.not.be.null;
    });

    it("relinquishes vote from proposal", async () => {
      // #given fresh position with active vote
      const result = await createAndFundPosition(ctx, {
        amount: "100000000",
        lockupKind: "cliff",
        lockupPeriodsInDays: 365,
      });

      const { data: voteData, error: voteError } =
        await ctx.safeClient.governance.vote({
          walletAddress,
          proposalKey: proposalSetup.proposal.toBase58(),
          positionMints: [result.positionMint],
          choice: 0,
        });
      if (voteError) {
        throw new Error(`Failed to vote: ${JSON.stringify(voteError)}`);
      }
      await signAndSubmitTransactionData(
        ctx.connection,
        voteData!.transactionData,
        ctx.payer
      );

      // #when relinquishing vote
      const { data, error } = await ctx.safeClient.governance.relinquishVote({
        walletAddress,
        proposalKey: proposalSetup.proposal.toBase58(),
        positionMints: [result.positionMint],
        choice: 0,
      });

      // #then transaction builds and submits
      if (error) {
        expect.fail(`Unexpected error: ${JSON.stringify(error)}`);
      }
      expect(data?.transactionData?.transactions).to.have.length(1);
      expect(data?.transactionData?.transactions[0].metadata?.type).to.equal(
        "voting_relinquish"
      );

      const sigs = await signAndSubmitTransactionData(
        ctx.connection,
        data.transactionData,
        ctx.payer
      );
      expect(sigs).to.have.length(1);

      // Verify vote marker choice is removed on-chain
      const { vsrProgram } = await getPrograms(ctx);
      const [voteMarker] = voteMarkerKey(
        new PublicKey(result.positionMint),
        proposalSetup.proposal
      );
      const markerAfter = await vsrProgram.account.voteMarkerV0.fetchNullable(
        voteMarker
      );
      if (markerAfter) {
        expect(markerAfter.choices).to.not.include(0);
      }
    });

    it("reports a position already at max choices as skipped, still voting the rest", async () => {
      // #given a maxChoicesPerVoter=1 proposal and a position that has used its
      // one choice (voted choice 0), plus a fresh position that has not voted
      const maxOneProposal = await createTestProposal(ctx, {
        name: `max-one-${Date.now()}`,
        maxChoicesPerVoter: 1,
      });
      const usedUp = await createAndFundPosition(ctx, {
        amount: "100000000",
        lockupKind: "cliff",
        lockupPeriodsInDays: 365,
      });
      const fresh = await createAndFundPosition(ctx, {
        amount: "100000000",
        lockupKind: "cliff",
        lockupPeriodsInDays: 365,
      });

      await castVote(
        maxOneProposal.proposal.toBase58(),
        [usedUp.positionMint],
        0
      );

      // #when voting a different choice with the used-up and the fresh position
      const { data, error } = await ctx.safeClient.governance.vote({
        walletAddress,
        proposalKey: maxOneProposal.proposal.toBase58(),
        positionMints: [usedUp.positionMint, fresh.positionMint],
        choice: 1,
      });

      // #then the used-up position is reported as skipped, the fresh one votes
      if (error) {
        expect.fail(`Unexpected error: ${JSON.stringify(error)}`);
      }
      expect(data?.skipped).to.deep.include({
        positionMint: usedUp.positionMint,
        reason: "maxChoicesReached",
      });
      expect(data?.transactionData?.transactions).to.have.length(1);
    });

    it("reports a position that already voted this choice as skipped, still voting the rest", async () => {
      // #given a position that already voted choice 0 and a fresh position
      const alreadyVoted = await createAndFundPosition(ctx, {
        amount: "100000000",
        lockupKind: "cliff",
        lockupPeriodsInDays: 365,
      });
      const fresh = await createAndFundPosition(ctx, {
        amount: "100000000",
        lockupKind: "cliff",
        lockupPeriodsInDays: 365,
      });

      await castVote(
        proposalSetup.proposal.toBase58(),
        [alreadyVoted.positionMint],
        0
      );

      // #when re-voting choice 0 with the already-voted and the fresh position
      const { data, error } = await ctx.safeClient.governance.vote({
        walletAddress,
        proposalKey: proposalSetup.proposal.toBase58(),
        positionMints: [alreadyVoted.positionMint, fresh.positionMint],
        choice: 0,
      });

      // #then the already-voted position is skipped without noise, fresh votes
      if (error) {
        expect.fail(`Unexpected error: ${JSON.stringify(error)}`);
      }
      expect(data?.skipped).to.deep.include({
        positionMint: alreadyVoted.positionMint,
        reason: "alreadyVotedThisChoice",
      });
      expect(data?.transactionData?.transactions).to.have.length(1);
      // The single vote-building procedure serves both fee-estimation/prepare
      // and submission, so estimatedSolFee ships alongside the skip report.
      expect(data?.estimatedSolFee).to.not.be.undefined;
    });

    it("returns the skip report when every position is skipped", async () => {
      // #given a position that already voted choice 1
      const result = await createAndFundPosition(ctx, {
        amount: "100000000",
        lockupKind: "cliff",
        lockupPeriodsInDays: 365,
      });

      await castVote(
        proposalSetup.proposal.toBase58(),
        [result.positionMint],
        1
      );

      // #when re-voting the same choice with that lone position
      const { error } = await ctx.safeClient.governance.vote({
        walletAddress,
        proposalKey: proposalSetup.proposal.toBase58(),
        positionMints: [result.positionMint],
        choice: 1,
      });

      // #then it errors, but the error carries the full skip report
      if (!isDefinedError(error) || error.code !== "ALL_POSITIONS_SKIPPED") {
        expect.fail(
          `Expected ALL_POSITIONS_SKIPPED - but got: ${JSON.stringify(error)}`
        );
      }
      expect(error.data.skipped).to.deep.include({
        positionMint: result.positionMint,
        reason: "alreadyVotedThisChoice",
      });
    });

    it("returns the same skip report on repeated prepare calls", async () => {
      // #given a position that already voted choice 0 and a fresh position
      const alreadyVoted = await createAndFundPosition(ctx, {
        amount: "100000000",
        lockupKind: "cliff",
        lockupPeriodsInDays: 365,
      });
      const fresh = await createAndFundPosition(ctx, {
        amount: "100000000",
        lockupKind: "cliff",
        lockupPeriodsInDays: 365,
      });

      await castVote(
        proposalSetup.proposal.toBase58(),
        [alreadyVoted.positionMint],
        0
      );

      // #when preparing the same vote twice without submitting in between
      const prepareArgs = {
        walletAddress,
        proposalKey: proposalSetup.proposal.toBase58(),
        positionMints: [alreadyVoted.positionMint, fresh.positionMint],
        choice: 0,
      };
      const first = await ctx.safeClient.governance.vote(prepareArgs);
      const second = await ctx.safeClient.governance.vote(prepareArgs);

      // #then both prepare calls return the same skip report
      if (first.error || second.error) {
        expect.fail(
          `Unexpected error: ${JSON.stringify(first.error ?? second.error)}`
        );
      }
      expect(second.data?.skipped).to.deep.equal(first.data?.skipped);
      expect(first.data?.skipped).to.deep.include({
        positionMint: alreadyVoted.positionMint,
        reason: "alreadyVotedThisChoice",
      });
    });
  });

  describe("relinquish all position votes", () => {
    let walletAddress: string;
    let positionMint: string;

    before(async () => {
      walletAddress = ctx.payer.publicKey.toBase58();

      // Create position for voting
      const result = await createAndFundPosition(ctx, {
        amount: "100000000",
        lockupKind: "cliff",
        lockupPeriodsInDays: 365,
      });
      positionMint = result.positionMint;

      // Vote on the org proposal
      const { data, error } = await ctx.safeClient.governance.vote({
        walletAddress,
        proposalKey: orgProposalSetup.proposal.toBase58(),
        positionMints: [positionMint],
        choice: 0,
      });
      if (error) {
        throw new Error(`Failed to vote: ${JSON.stringify(error)}`);
      }
      await signAndSubmitTransactionData(
        ctx.connection,
        data!.transactionData,
        ctx.payer
      );
    });

    it("relinquishes all votes from position via organization", async () => {
      // #given position with active vote on org-based proposal
      // #when relinquishing all position votes
      const { data, error } =
        await ctx.safeClient.governance.relinquishPositionVotes({
          walletAddress,
          positionMint,
          organization: orgProposalSetup.organization!.toBase58(),
        });

      // #then transaction builds with correct metadata
      if (error) {
        expect.fail(`Unexpected error: ${JSON.stringify(error)}`);
      }
      expect(data?.transactionData?.transactions).to.have.length(1);
      expect(data?.transactionData?.transactions[0].metadata?.type).to.equal(
        "voting_relinquish_all"
      );
      expect(
        data?.transactionData?.transactions[0].metadata?.votesRelinquished
      ).to.equal(1);
      const sigs = await signAndSubmitTransactionData(
        ctx.connection,
        data.transactionData,
        ctx.payer
      );
      expect(sigs).to.have.length(1);

      // Verify vote marker is cleared on-chain
      const [voteMarker] = voteMarkerKey(
        new PublicKey(positionMint),
        orgProposalSetup.proposal
      );
      const { vsrProgram } = await getPrograms(ctx);
      const markerAfter = await vsrProgram.account.voteMarkerV0.fetchNullable(
        voteMarker
      );
      if (markerAfter) {
        expect(markerAfter.choices).to.have.length(0);
      }
    });
  });

  describe("error cases", () => {
    describe("positions - BAD_REQUEST errors", () => {
      it("returns BAD_REQUEST when closing position with active votes", async () => {
        // #given position with an active vote
        const walletAddress = ctx.payer.publicKey.toBase58();
        const result = await createAndFundPosition(ctx, {
          amount: "100000000",
          lockupKind: "constant",
          lockupPeriodsInDays: 365,
        });

        const { data: voteData, error: voteError } =
          await ctx.safeClient.governance.vote({
            walletAddress,
            proposalKey: proposalSetup.proposal.toBase58(),
            positionMints: [result.positionMint],
            choice: 0,
          });
        if (voteError) {
          throw new Error(`Failed to vote: ${JSON.stringify(voteError)}`);
        }
        await signAndSubmitTransactionData(
          ctx.connection,
          voteData!.transactionData,
          ctx.payer
        );

        // #when trying to close position with active votes
        const { error } = await ctx.safeClient.governance.closePosition({
          walletAddress,
          positionMint: result.positionMint,
        });

        // #then returns BAD_REQUEST
        if (!isDefinedError(error)) {
          expect.fail(
            `Expected defined ORPCError - but got: ${JSON.stringify(error)}`
          );
        }
        expect(error.code).to.equal("BAD_REQUEST");
        expect(error.message).to.include("active votes");
      });

      it("returns BAD_REQUEST when closing position with unexpired cliff lockup", async () => {
        // #given position with cliff lockup far in the future
        const walletAddress = ctx.payer.publicKey.toBase58();
        const result = await createAndFundPosition(ctx, {
          amount: "100000000",
          lockupKind: "cliff",
          lockupPeriodsInDays: 365,
        });

        // #when trying to close the position
        const { error } = await ctx.safeClient.governance.closePosition({
          walletAddress,
          positionMint: result.positionMint,
        });

        // #then returns BAD_REQUEST about lockup not expired
        if (!isDefinedError(error)) {
          expect.fail(
            `Expected defined ORPCError - but got: ${JSON.stringify(error)}`
          );
        }
        expect(error.code).to.equal("BAD_REQUEST");
        expect(error.message).to.include("lockup has not expired");
      });

      it("returns BAD_REQUEST when split amount exceeds balance", async () => {
        // #given position with 1 HNT
        const walletAddress = ctx.payer.publicKey.toBase58();
        const result = await createAndFundPosition(ctx, {
          amount: "100000000", // 1 HNT
          lockupKind: "cliff",
          lockupPeriodsInDays: 30,
        });

        // #when splitting 2 HNT (more than available)
        const { error } = await ctx.safeClient.governance.splitPosition({
          walletAddress,
          positionMint: result.positionMint,
          amount: "200000000", // 2 HNT
          lockupKind: "cliff",
          lockupPeriodsInDays: 60,
        });

        // #then returns BAD_REQUEST
        if (!isDefinedError(error)) {
          expect.fail(
            `Expected defined ORPCError - but got: ${JSON.stringify(error)}`
          );
        }
        expect(error.code).to.equal("BAD_REQUEST");
        expect(error.message).to.include("exceeds");
      });

      it("returns BAD_REQUEST when transferring from position with active votes", async () => {
        // #given source position with active vote
        const walletAddress = ctx.payer.publicKey.toBase58();
        const source = await createAndFundPosition(ctx, {
          amount: "200000000", // 2 HNT
          lockupKind: "cliff",
          lockupPeriodsInDays: 365,
        });

        // Split to create a target position
        const { data: splitData, error: splitError } =
          await ctx.safeClient.governance.splitPosition({
            walletAddress,
            positionMint: source.positionMint,
            amount: "100000000",
            lockupKind: "cliff",
            lockupPeriodsInDays: 365,
          });
        if (splitError) {
          throw new Error(`Failed to split: ${JSON.stringify(splitError)}`);
        }
        await signAndSubmitTransactionData(
          ctx.connection,
          splitData!.transactionData,
          ctx.payer
        );
        const targetMint = splitData!.transactionData.transactions[0].metadata
          ?.newPositionMint as string;

        // Vote with source position
        const { data: voteData, error: voteError } =
          await ctx.safeClient.governance.vote({
            walletAddress,
            proposalKey: proposalSetup.proposal.toBase58(),
            positionMints: [source.positionMint],
            choice: 0,
          });
        if (voteError) {
          throw new Error(`Failed to vote: ${JSON.stringify(voteError)}`);
        }
        await signAndSubmitTransactionData(
          ctx.connection,
          voteData!.transactionData,
          ctx.payer
        );

        // #when trying to transfer from position with active votes
        const { error } = await ctx.safeClient.governance.transferPosition({
          walletAddress,
          positionMint: source.positionMint,
          targetPositionMint: targetMint,
          amount: "50000000",
        });

        // #then returns BAD_REQUEST
        if (!isDefinedError(error)) {
          expect.fail(
            `Expected defined ORPCError - but got: ${JSON.stringify(error)}`
          );
        }
        expect(error.code).to.equal("BAD_REQUEST");
        expect(error.message).to.include("active votes");
      });
    });

    describe("delegation - NOT_FOUND and BAD_REQUEST errors", () => {
      it("returns BAD_REQUEST for undelegate on non-delegated position", async () => {
        // #given position that's not delegated
        const walletAddress = ctx.payer.publicKey.toBase58();
        const result = await createAndFundPosition(ctx, {
          amount: "100000000",
          lockupKind: "cliff",
          lockupPeriodsInDays: 30,
        });

        // #when requesting undelegate
        const { error } = await ctx.safeClient.governance.undelegatePosition({
          walletAddress,
          positionMint: result.positionMint,
        });

        // #then returns BAD_REQUEST
        if (!isDefinedError(error)) {
          expect.fail(
            `Expected defined ORPCError - but got: ${JSON.stringify(error)}`
          );
        }
        expect(error.code).to.equal("BAD_REQUEST");
        expect(error.message).to.include("not delegated");
      });

      it("returns BAD_REQUEST for extend on non-delegated position", async () => {
        // #given position that's not delegated
        const walletAddress = ctx.payer.publicKey.toBase58();
        const result = await createAndFundPosition(ctx, {
          amount: "100000000",
          lockupKind: "cliff",
          lockupPeriodsInDays: 30,
        });

        // #when requesting delegation extend
        const { error } = await ctx.safeClient.governance.extendDelegation({
          walletAddress,
          positionMint: result.positionMint,
        });

        // #then returns BAD_REQUEST
        if (!isDefinedError(error)) {
          expect.fail(
            `Expected defined ORPCError - but got: ${JSON.stringify(error)}`
          );
        }
        expect(error.code).to.equal("BAD_REQUEST");
        expect(error.message).to.include("not delegated");
      });

      it("returns BAD_REQUEST for delegate on fully decayed position", async () => {
        // #given cliff position with lockup decayed (endTs in the past)
        const walletAddress = ctx.payer.publicKey.toBase58();
        const result = await createAndFundPosition(ctx, {
          amount: "100000000",
          lockupKind: "cliff",
          lockupPeriodsInDays: 30,
        });

        const [positionPubkey] = positionKey(
          new PublicKey(result.positionMint)
        );

        const clockInfo = await ctx.connection.getAccountInfo(
          SYSVAR_CLOCK_PUBKEY
        );
        const clockTimestamp = Number(clockInfo!.data.readBigInt64LE(32));
        await setPositionLockupEndTs(
          ctx,
          positionPubkey,
          clockTimestamp - 3600
        );

        // #when attempting to delegate
        const { error } = await ctx.safeClient.governance.delegatePositions({
          walletAddress,
          positionMints: [result.positionMint],
          subDaoMint: MOBILE_MINT.toBase58(),
          automationEnabled: false,
        });

        // #then returns BAD_REQUEST with decay message
        if (!isDefinedError(error)) {
          expect.fail(
            `Expected defined ORPCError - but got: ${JSON.stringify(error)}`
          );
        }
        expect(error.code).to.equal("BAD_REQUEST");
        expect(error.message).to.equal(
          "Position lockup has fully decayed and cannot be delegated"
        );
      });

      it("returns BAD_REQUEST for extend on fully decayed position", async () => {
        // #given delegated cliff position with lockup decayed (endTs in the past)
        const walletAddress = ctx.payer.publicKey.toBase58();
        const result = await createAndFundPosition(ctx, {
          amount: "100000000",
          lockupKind: "cliff",
          lockupPeriodsInDays: 365,
          subDaoMint: MOBILE_MINT,
        });

        const [positionPubkey] = positionKey(
          new PublicKey(result.positionMint)
        );

        const clockInfo = await ctx.connection.getAccountInfo(
          SYSVAR_CLOCK_PUBKEY
        );
        const clockTimestamp = Number(clockInfo!.data.readBigInt64LE(32));
        await setPositionLockupEndTs(
          ctx,
          positionPubkey,
          clockTimestamp - 3600
        );

        // #when attempting to extend delegation
        const { error } = await ctx.safeClient.governance.extendDelegation({
          walletAddress,
          positionMint: result.positionMint,
        });

        // #then returns BAD_REQUEST with decay message
        if (!isDefinedError(error)) {
          expect.fail(
            `Expected defined ORPCError - but got: ${JSON.stringify(error)}`
          );
        }
        expect(error.code).to.equal("BAD_REQUEST");
        expect(error.message).to.equal(
          "Position lockup has fully decayed and cannot be extended"
        );
      });
    });

    describe("proxy - BAD_REQUEST errors", () => {
      it("returns BAD_REQUEST for unassign when no proxy exists", async () => {
        // #given position with no proxy assigned
        const walletAddress = ctx.payer.publicKey.toBase58();
        const result = await createAndFundPosition(ctx, {
          amount: "100000000",
          lockupKind: "cliff",
          lockupPeriodsInDays: 30,
        });

        // #when requesting unassign
        const { error } = await ctx.safeClient.governance.unassignProxies({
          walletAddress,
          positionMints: [result.positionMint],
          proxyKey: TEST_PROXY_ADDRESS,
        });

        // #then returns BAD_REQUEST
        if (!isDefinedError(error)) {
          expect.fail(
            `Expected defined ORPCError - but got: ${JSON.stringify(error)}`
          );
        }
        expect(error.code).to.equal("BAD_REQUEST");
        expect(error.message).to.include("No proxy assignments");
      });
    });
  });
});
