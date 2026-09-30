import { AnchorProvider, Wallet } from "@anchor-lang/core";
import {
  resetTxVersionCache,
  resolveTxVersion,
  sendInstructions,
  setLoadedAccountsDataSizeLimit,
} from "@helium/spl-utils";
import {
  ComputeBudgetProgram,
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  MessageV1,
  SystemProgram,
} from "@solana/web3.js";
import { expect } from "chai";
import { after, before, describe, it } from "mocha";
import {
  ensureSurfpool,
  getSurfpoolRpcUrl,
  stopSurfpool,
} from "./helpers/surfpool";
import { expectLandedTxVersion } from "./helpers/tx";
import { ensureFunds } from "./helpers/wallet";

// solana-core of the surfpool v1.6.0 fork that blockchain-api-e2e.yml pins.
const FORK_SOLANA_CORE = "4.2.1";

// Each CI lane forces HPL_TX_VERSION; the kill switch (v0) must hold on the
// keypair path that the admin CLI and crons send through. A local run without
// a lane has nothing to force.
const laneVersion = (): 0 | 1 | undefined => {
  const lane = process.env.HPL_TX_VERSION;
  if (lane === undefined) return undefined;
  if (lane !== "v0" && lane !== "v1") {
    throw new Error("Run with HPL_TX_VERSION=v1 or HPL_TX_VERSION=v0");
  }
  return lane === "v1" ? 1 : 0;
};

describe("transaction version on the fork", () => {
  let connection: Connection;
  let provider: AnchorProvider;

  before(async () => {
    await ensureSurfpool();
    connection = new Connection(getSurfpoolRpcUrl(), "confirmed");
    const payer = Keypair.generate();
    await ensureFunds(payer.publicKey, LAMPORTS_PER_SOL);
    provider = new AnchorProvider(
      connection,
      new Wallet(payer),
      AnchorProvider.defaultOptions()
    );
  });

  it("sendInstructions lands the lane's version with the compute budget in the v1 header", async function () {
    const expected = laneVersion();
    if (expected === undefined) {
      console.log("[tx-version] HPL_TX_VERSION unset; no lane to assert");
      this.skip();
    }
    const payer = provider.wallet.publicKey;
    const signature = await sendInstructions(provider, [
      ComputeBudgetProgram.setComputeUnitLimit({ units: 50_000 }),
      ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 20_000 }),
      setLoadedAccountsDataSizeLimit(128 * 1024),
      SystemProgram.transfer({
        fromPubkey: payer,
        toPubkey: Keypair.generate().publicKey,
        lamports: LAMPORTS_PER_SOL / 100,
      }),
    ]);

    const landed = await expectLandedTxVersion(connection, signature, expected);
    if (expected === 0) return;
    // Priority fee is microLamports x CU limit / 1e6, rounded up.
    expect(
      (landed.transaction.message as MessageV1).transactionConfig
    ).to.deep.include({
      computeUnitLimit: 50_000,
      loadedAccountsDataSizeLimit: 128 * 1024,
      priorityFee: 1_000,
    });
  });

  it("resolveTxVersion with no override detects the fork's version", async () => {
    const lane = process.env.HPL_TX_VERSION;
    delete process.env.HPL_TX_VERSION;
    resetTxVersionCache();
    try {
      const { "solana-core": solanaCore } = await connection.getVersion();
      expect(solanaCore).to.equal(FORK_SOLANA_CORE);
      expect(await resolveTxVersion(connection)).to.equal(1);
    } finally {
      if (lane === undefined) delete process.env.HPL_TX_VERSION;
      else process.env.HPL_TX_VERSION = lane;
      resetTxVersionCache();
    }
  });

  after(async () => {
    // web3.js closes an idle websocket 500ms after its last subscription
    // ends; one still open when surfpool stops reconnects forever and mocha
    // never exits.
    await new Promise((resolve) => setTimeout(resolve, 1_000));
    await stopSurfpool();
  });
});
