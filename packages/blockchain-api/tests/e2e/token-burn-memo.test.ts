import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
} from "@solana/web3.js";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";
import { expect } from "chai";
import { after, before, describe, it } from "mocha";
import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import type { appRouter } from "@/server/api";
import type { RouterClient } from "@orpc/server";
import { TOKEN_MINTS } from "../../src/lib/constants/tokens";
import { applyMinimalServerEnv } from "./helpers/env";
import { ensureNextServer, stopNextServer } from "./helpers/next";
import {
  ensureSurfpool,
  getSurfpoolRpcUrl,
  stopSurfpool,
} from "./helpers/surfpool";
import { ensureFunds, ensureTokenBalance } from "./helpers/wallet";
import { signAndSubmitTransactionData } from "./helpers/tx";

// Token burn and memo need no real wallet or ASSET_ENDPOINT: burn synthesizes
// the SPL balance on the surfpool fork via surfnet_setTokenAccount, and memo
// only needs SOL (airdropped). A freshly-generated keypair suffices.
describe("token burn and memo", () => {
  let payer: Keypair;
  let connection: Connection;
  let client: RouterClient<typeof appRouter>;

  before(async () => {
    process.env.ASSET_ENDPOINT ||= getSurfpoolRpcUrl();
    applyMinimalServerEnv();
    await ensureSurfpool();
    await ensureNextServer();

    payer = Keypair.generate();
    connection = new Connection(getSurfpoolRpcUrl(), "confirmed");
    await ensureFunds(payer.publicKey, 0.05 * LAMPORTS_PER_SOL);

    const link = new RPCLink({ url: "http://127.0.0.1:3000/rpc" });
    client = createORPCClient(link);
  });

  after(async () => {
    await stopNextServer();
    await stopSurfpool();
  });

  it("burns SPL tokens and reduces the balance", async () => {
    const hntMint = new PublicKey(TOKEN_MINTS.HNT);
    await ensureTokenBalance(payer.publicKey, hntMint, 5); // 5 HNT (8 decimals)
    const ata = getAssociatedTokenAddressSync(hntMint, payer.publicKey, true);

    const before = (await connection.getTokenAccountBalance(ata)).value.amount;
    expect(Number(before)).to.equal(500_000_000);

    const txData = await client.tokens.burn({
      walletAddress: payer.publicKey.toBase58(),
      tokenAmount: { amount: "100000000", mint: TOKEN_MINTS.HNT }, // burn 1 HNT
    });
    expect(txData.transactionData.transactions.length).to.be.greaterThan(0);

    await signAndSubmitTransactionData(
      connection,
      txData.transactionData,
      payer
    );

    const after = (await connection.getTokenAccountBalance(ata)).value.amount;
    expect(Number(after)).to.equal(400_000_000);
  });

  it("emits a memo transaction that confirms", async () => {
    const txData = await client.tokens.memo({
      walletAddress: payer.publicKey.toBase58(),
      memo: "helium-wallet e2e memo",
    });
    expect(txData.transactionData.transactions.length).to.equal(1);

    // signAndSubmitTransactionData throws if the tx fails to confirm.
    const sigs = await signAndSubmitTransactionData(
      connection,
      txData.transactionData,
      payer
    );
    expect(sigs.length).to.equal(1);
  });
});
