import { AnchorProvider } from "@coral-xyz/anchor";
import { init as initWelcomePack } from "@helium/welcome-pack-sdk";
import { init as initLd, recipientKey } from "@helium/lazy-distributor-sdk";
import { init as initMiniFanout } from "@helium/mini-fanout-sdk";
import { Keypair, PublicKey } from "@solana/web3.js";
import { NATIVE_MINT } from "@solana/spl-token";
import { expect } from "chai";
import { after, before, describe, it } from "mocha";
import { stopNextServer } from "./helpers/next"
import { stopSurfpool } from "./helpers/surfpool"
import { signAndSubmitTransactionData } from "./helpers/tx"
import { setupTestCtx, TestCtx } from "./helpers/context"
import {
  DEFAULT_HPL_CRONS_TASK_QUEUE,
  HNT_LAZY_DISTRIBUTOR_ADDRESS,
} from "./helpers/constants"
import { verifyEstimatedSolFee } from "./helpers/estimate"
import nacl from "tweetnacl"

describe("welcome-pack", () => {
  let ctx: TestCtx;

  before(async () => {
    ctx = await setupTestCtx({
      setupFeePayer: true,
      taskQueue: DEFAULT_HPL_CRONS_TASK_QUEUE,
    });
  });

  after(async () => {
    await stopNextServer();
    await stopSurfpool();
  });

  it("creates a welcome pack", async () => {
    const walletAddress = ctx.payer.publicKey.toBase58();

    const result = await ctx.client.welcomePacks.create({
      walletAddress,
      assetId: "CKesVwoY6mfc7iyjzYTKvigjcWoGZgnvEAX1UaGr7o89",
      solAmount: { amount: "10000000", mint: NATIVE_MINT.toBase58() },
      rentRefund: "72szxs4Q2JNuM4MQAo79xZNdb9qtBEjTqxZTsRwt8bFn",
      assetReturnAddress: "72szxs4Q2JNuM4MQAo79xZNdb9qtBEjTqxZTsRwt8bFn",
      rewardsSplit: [
        {
          address: "devXCnFPU71StPEFNnGRf4iqXoRpYkNsGEg9m757ktP",
          type: "percentage" as const,
          amount: 30,
        },
        {
          address: "72szxs4Q2JNuM4MQAo79xZNdb9qtBEjTqxZTsRwt8bFn",
          type: "percentage" as const,
          amount: 70,
        },
      ],
      schedule: {
        frequency: "monthly" as const,
        time: "09:00",
        timezone: "America/New_York",
        dayOfMonth: "15",
      },
      lazyDistributor: "6gcZXjHgKUBMedc2V1aZLFPwh8M1rPVRw7kpo2KqNrFq",
    });

    expect(
      result?.transactionData?.transactions?.[0]?.serializedTransaction,
    ).to.be.a("string");
    expect(result?.welcomePack?.address).to.be.a("string");
    // Verify response welcomePack shape matches request expectations
    expect(result.welcomePack.owner).to.equal(walletAddress);
    expect(result.welcomePack.asset).to.equal(
      "CKesVwoY6mfc7iyjzYTKvigjcWoGZgnvEAX1UaGr7o89",
    );
    expect(result.welcomePack.lazyDistributor).to.equal(
      "6gcZXjHgKUBMedc2V1aZLFPwh8M1rPVRw7kpo2KqNrFq",
    );
    expect(result.welcomePack.assetReturnAddress).to.equal(
      "72szxs4Q2JNuM4MQAo79xZNdb9qtBEjTqxZTsRwt8bFn",
    );
    expect(result.welcomePack.rentRefund).to.equal(
      "72szxs4Q2JNuM4MQAo79xZNdb9qtBEjTqxZTsRwt8bFn",
    );
    expect(result.welcomePack.solAmount).to.equal("10000000");
    expect(result.welcomePack.rewardsSplit).to.be.an("array").with.lengthOf(2);
    expect(result.welcomePack.rewardsSplit[0]).to.include({
      address: "devXCnFPU71StPEFNnGRf4iqXoRpYkNsGEg9m757ktP",
      amount: 30,
      type: "percentage",
    });
    expect(result.welcomePack.rewardsSplit[1]).to.include({
      address: "72szxs4Q2JNuM4MQAo79xZNdb9qtBEjTqxZTsRwt8bFn",
      amount: 70,
      type: "percentage",
    })

    // Verify estimate accuracy
    await verifyEstimatedSolFee(ctx, result.transactionData, result.estimatedSolFee)

    const welcomePackAddress = result.welcomePack.address as string
    await signAndSubmitTransactionData(
      ctx.connection,
      result.transactionData,
      ctx.payer,
    )

    const provider = new AnchorProvider(
      ctx.connection,
      {
        publicKey: ctx.payer.publicKey,
        signAllTransactions: async () => {
          throw new Error("not supported in test");
        },
        signTransaction: async () => {
          throw new Error("not supported in test");
        },
      } as any,
      AnchorProvider.defaultOptions(),
    );
    const program = await initWelcomePack(provider);
    const fetched = await program.account.welcomePackV0.fetchNullable(
      new PublicKey(welcomePackAddress),
    );
    expect(fetched).to.exist;
    // On-chain spot checks where field names are stable across SDK versions
    expect(fetched?.owner?.toBase58?.()).to.equal(walletAddress);
    expect(fetched?.lazyDistributor?.toBase58?.()).to.equal(
      "6gcZXjHgKUBMedc2V1aZLFPwh8M1rPVRw7kpo2KqNrFq",
    );
    expect(fetched?.asset?.toBase58?.()).to.equal(
      "CKesVwoY6mfc7iyjzYTKvigjcWoGZgnvEAX1UaGr7o89",
    );
  });

  it("closes a welcome pack", async () => {
    const walletAddress = ctx.payer.publicKey.toBase58();
    const packId = 8;

    const result = await ctx.client.welcomePacks.delete({
      walletAddress,
      packId,
    });

    expect(
      result?.transactionData?.transactions?.[0]?.serializedTransaction,
    ).to.be.a("string");

    await signAndSubmitTransactionData(
      ctx.connection,
      result.transactionData,
      ctx.payer,
    );

    // TODO: Verify closure when surfpool fixes this issue:
    // https://github.com/txtx/surfpool/issues/402
    // const provider = new AnchorProvider(
    //   ctx.connection,
    //   { publicKey: ctx.payer.publicKey, signAllTransactions: async () => { throw new Error('not supported in test') }, signTransaction: async () => { throw new Error('not supported in test') } } as any,
    //   AnchorProvider.defaultOptions()
    // )
    // const program = await initWelcomePack(provider)
    // const fetched = await program.account.welcomePackV0.fetchNullable(new PublicKey(packAddress))
    // expect(fetched).to.be.null
  });

  it("generates an invite and claims a welcome pack", async () => {
    const owner = ctx.payer;
    const claimer = Keypair.generate();

    const welcomePackAddress = "G8dRECzZRLMf6bjswi7F9KZvNQbnjzqcwGbXyj21gw8v";
    // Fetch canonical message and expiration from server
    const inviteResult = await ctx.client.welcomePacks.invite({
      packAddress: welcomePackAddress,
      walletAddress: owner.publicKey.toBase58(),
      expirationDays: 1,
    });

    const message = Buffer.from(inviteResult.message);
    const sig = nacl.sign.detached(message, owner.secretKey);
    const signatureB64 = Buffer.from(sig).toString("base64");
    const expirationTs = String(inviteResult.expirationTs);

    const claimResult = await ctx.client.welcomePacks.claim({
      packAddress: welcomePackAddress,
      walletAddress: claimer.publicKey.toBase58(),
      signature: signatureB64,
      expirationTs,
    });

    expect(
      claimResult?.transactionData?.transactions?.[0]?.serializedTransaction,
    ).to.be.a("string");

    await signAndSubmitTransactionData(
      ctx.connection,
      claimResult.transactionData,
      claimer,
    );

    const afterBal = await ctx.connection.getBalance(claimer.publicKey);
    expect(afterBal).to.eq(3818440);

    const provider = new AnchorProvider(
      ctx.connection,
      {
        publicKey: owner.publicKey,
        signAllTransactions: async () => {
          throw new Error("not supported in test");
        },
        signTransaction: async () => {
          throw new Error("not supported in test");
        },
      } as any,
      AnchorProvider.defaultOptions(),
    );

    const ldProgram = await initLd(provider);
    const [recipientK] = recipientKey(
      new PublicKey(HNT_LAZY_DISTRIBUTOR_ADDRESS),
      new PublicKey("CFSfEZAskWxjy3MrBB4Zy9HoLSLi7fpMePsuGYXvBL6A"),
    );
    const recipientAcc = await ldProgram.account.recipientV0.fetchNullable(
      recipientK,
    );
    expect(recipientAcc?.destination).to.exist;

    const miniFanoutProgram = await initMiniFanout(provider);
    const miniFanout =
      await miniFanoutProgram.account.miniFanoutV0.fetchNullable(
        recipientAcc!.destination,
      );
    expect(miniFanout).to.exist;
    const wallets = miniFanout!.shares.map((s: any) => s.wallet.toBase58());
    expect(wallets).to.include.members([
      ctx.payer.publicKey.toBase58(),
      claimer.publicKey.toBase58(),
    ]);
  });
});
