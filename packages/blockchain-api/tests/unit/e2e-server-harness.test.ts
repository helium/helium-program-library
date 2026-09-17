import { expect } from "chai";
import { ensureServer, stopServer } from "../e2e/helpers/server";

// A port no other service in this repo binds, so the harness always builds a
// server instead of adopting one that already answers.
const PORT = 34551;

const applyBaseEnv = (): void => {
  process.env.PG_USER = "test";
  process.env.PG_NAME = "test";
  process.env.PG_HOST = "localhost";
  process.env.PG_PORT = "5432";
  process.env.PRIVY_APP_SECRET = "test";
  process.env.PRIVY_APP_ID = "test";
  process.env.JUPITER_API_KEY = "test";
  process.env.NO_PG = "true";
};

// The env the running server reads: `src/lib/env` parses `process.env` once at
// module load, so the module instance the harness just loaded is the server's
// own view of its configuration.
const serverEnv = async () => (await import("../../src/lib/env")).env;

describe("e2e server harness", () => {
  after(async () => {
    await stopServer();
  });

  it("gives each server the env set before it was started", async () => {
    applyBaseEnv();

    process.env.FEE_PAYER_WALLET_PATH = "/tmp/first-fee-payer.json";
    process.env.SOLANA_RPC_URL = "http://127.0.0.1:18899";
    await ensureServer({ port: PORT });
    expect((await serverEnv()).FEE_PAYER_WALLET_PATH).to.equal(
      "/tmp/first-fee-payer.json",
    );
    expect((await serverEnv()).SOLANA_RPC_URL).to.equal(
      "http://127.0.0.1:18899",
    );
    await stopServer();

    process.env.FEE_PAYER_WALLET_PATH = "/tmp/second-fee-payer.json";
    process.env.SOLANA_RPC_URL = "http://127.0.0.1:28899";
    await ensureServer({ port: PORT });
    expect((await serverEnv()).FEE_PAYER_WALLET_PATH).to.equal(
      "/tmp/second-fee-payer.json",
    );
    expect((await serverEnv()).SOLANA_RPC_URL).to.equal(
      "http://127.0.0.1:28899",
    );
  });
});
