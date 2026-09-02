import {
  delegatedPositionKey,
  init as initHsd,
} from "@helium/helium-sub-daos-sdk";
import {
  delegationClaimBotKey,
  init as initHplCrons,
} from "@helium/hpl-crons-sdk";
import { MOBILE_MINT } from "@helium/spl-utils";
import { positionKey } from "@helium/voter-stake-registry-sdk";
import { PublicKey } from "@solana/web3.js";
import { expect } from "chai";
import { after, before, describe, it } from "mocha";
import { DEFAULT_HPL_CRONS_TASK_QUEUE } from "./helpers/constants";
import { setupTestCtx, TestCtx } from "./helpers/context";
import { createAndFundPosition, getPrograms } from "./helpers/governance";
import { stopNextServer } from "./helpers/next";
import { stopSurfpool } from "./helpers/surfpool";
import { signAndSubmitTransactionData } from "./helpers/tx";

/**
 * The claim-bot instructions are built with `accountsStrict`, so nothing
 * resolves the accounts they leave out: every account list here has to be
 * right on-chain, which only submitting the bundle proves.
 */
describe("delegatePositions automation", () => {
  let ctx: TestCtx;
  let walletAddress: string;

  before(async () => {
    ctx = await setupTestCtx();
    walletAddress = ctx.payer.publicKey.toBase58();
  });

  after(async () => {
    await stopNextServer();
    await stopSurfpool();
  });

  it("closes the claim bot when automation is turned off", async () => {
    // #given a delegated position whose claim automation is running
    const { positionMint } = await createAndFundPosition(ctx, {
      amount: "100000000",
      lockupKind: "cliff",
      lockupPeriodsInDays: 365,
    });

    const enabled = await ctx.client.governance.delegatePositions({
      walletAddress,
      positionMints: [positionMint],
      subDaoMint: MOBILE_MINT.toBase58(),
      automationEnabled: true,
    });
    await signAndSubmitTransactionData(
      ctx.connection,
      enabled.transactionData,
      ctx.payer,
    );

    const [positionPubkey] = positionKey(new PublicKey(positionMint));
    const [delegatedPosPubkey] = delegatedPositionKey(positionPubkey);
    const [botPubkey] = delegationClaimBotKey(
      new PublicKey(DEFAULT_HPL_CRONS_TASK_QUEUE),
      delegatedPosPubkey,
    );
    const { provider } = await getPrograms(ctx);
    const hplCronsProgram = await initHplCrons(provider);
    const bot =
      await hplCronsProgram.account.delegationClaimBotV0.fetch(botPubkey);
    expect(bot.queued).to.equal(true);

    // #when the same position is delegated again with automation off
    const { data, error } = await ctx.safeClient.governance.delegatePositions({
      walletAddress,
      positionMints: [positionMint],
      subDaoMint: MOBILE_MINT.toBase58(),
      automationEnabled: false,
    });

    // #then the close lands and the bot is gone
    if (error) {
      expect.fail(`Unexpected error: ${JSON.stringify(error)}`);
    }
    expect(
      data.transactionData.transactions.map((tx) => tx.metadata?.type),
    ).to.include("delegation_automation");
    await signAndSubmitTransactionData(
      ctx.connection,
      data.transactionData,
      ctx.payer,
    );

    expect(
      await hplCronsProgram.account.delegationClaimBotV0.fetchNullable(
        botPubkey,
      ),
    ).to.equal(null);
    // The delegation itself is untouched: only the automation was withdrawn.
    const hsdProgram = await initHsd(provider);
    expect(
      await hsdProgram.account.delegatedPositionV0.fetchNullable(
        delegatedPosPubkey,
      ),
    ).to.not.equal(null);
  });
});
