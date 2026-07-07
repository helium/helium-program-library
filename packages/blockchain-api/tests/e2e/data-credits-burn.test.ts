import { Connection, Keypair, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";
import { DC_MINT } from "@helium/spl-utils";
import { expect } from "chai";
import { after, before, describe, it } from "mocha";
import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import type { appRouter } from "@/server/api";
import type { RouterClient } from "@orpc/server";
import { applyMinimalServerEnv } from "./helpers/env";
import { ensureNextServer, stopNextServer } from "./helpers/next";
import {
  ensureSurfpool,
  getSurfpoolRpcUrl,
  stopSurfpool,
} from "./helpers/surfpool";
import { ensureFunds, ensureTokenBalance } from "./helpers/wallet";
import { signAndSubmitTransactionData } from "./helpers/tx";

// Direct DC burn needs no real wallet or ASSET_ENDPOINT: the DC balance is
// synthesized on the surfpool fork via the surfnet_setTokenAccount cheat, so a
// freshly-generated keypair suffices.
describe("data-credits burn", () => {
  let payer: Keypair;
  let connection: Connection;
  let client: RouterClient<typeof appRouter>;

  before(async () => {
    // ASSET_ENDPOINT is unused by the burn path but some server env checks
    // expect it set; point it at the fork so boot never blocks on it.
    process.env.ASSET_ENDPOINT ||= getSurfpoolRpcUrl();
    applyMinimalServerEnv();
    await ensureSurfpool();
    await ensureNextServer();

    payer = Keypair.generate();
    connection = new Connection(getSurfpoolRpcUrl(), "confirmed");
    await ensureFunds(payer.publicKey, 0.05 * LAMPORTS_PER_SOL);
    await ensureTokenBalance(payer.publicKey, DC_MINT, 1000); // DC has 0 decimals

    const link = new RPCLink({ url: "http://127.0.0.1:3000/rpc" });
    client = createORPCClient(link);
  });

  after(async () => {
    await stopNextServer();
    await stopSurfpool();
  });

  it("burns data credits and reduces the DC balance", async () => {
    const owner = payer.publicKey.toBase58();
    const dcAta = getAssociatedTokenAddressSync(DC_MINT, payer.publicKey, true);

    const before = (await connection.getTokenAccountBalance(dcAta)).value
      .amount;
    expect(Number(before)).to.equal(1000);

    const txData = await client.dataCredits.burn({ owner, amount: "400" });
    expect(txData.transactions.length).to.be.greaterThan(0);

    await signAndSubmitTransactionData(connection, txData, payer);

    const after = (await connection.getTokenAccountBalance(dcAta)).value.amount;
    expect(Number(after)).to.equal(600);
  });
});
