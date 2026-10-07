import {
  ComputeBudgetProgram,
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
} from "@solana/web3.js";
import { expect } from "chai";
import { describe, it } from "mocha";
import { toVersionedTx } from "../../../spl-utils/src/transaction";
import {
  getRentLamports,
  getTotalTransactionFees,
  getTransactionFee,
} from "../../src/lib/utils/balance-validation";

const from = Keypair.generate().publicKey;
const to = Keypair.generate().publicKey;
const transfer = SystemProgram.transfer({
  fromPubkey: from,
  toPubkey: to,
  lamports: 1,
});

const compile = (ixs: TransactionInstruction[]): VersionedTransaction =>
  new VersionedTransaction(
    new TransactionMessage({
      payerKey: from,
      recentBlockhash: PublicKey.default.toBase58(),
      instructions: ixs,
    }).compileToV0Message()
  );

const stubConnection = (
  getFeeForMessage: Connection["getFeeForMessage"]
): Connection => ({ getFeeForMessage } as unknown as Connection);

const rpcFee = (value: number | null) =>
  stubConnection(async () => ({ context: { slot: 1 }, value }));

const rpcError = () =>
  stubConnection(async () => {
    throw new Error("rpc down");
  });

describe("getTransactionFee", () => {
  it("returns the cluster fee from getFeeForMessage", async () => {
    const tx = compile([transfer]);
    expect(await getTransactionFee(rpcFee(7500), tx)).to.eq(7500);
  });

  it("falls back to base + priority when the RPC returns null", async () => {
    // 100k CU limit at 50k microlamports/CU => priority 5000; base 5000 (1 sig)
    const tx = compile([
      ComputeBudgetProgram.setComputeUnitLimit({ units: 100_000 }),
      ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 50_000 }),
      transfer,
    ]);
    expect(await getTransactionFee(rpcFee(null), tx)).to.eq(10_000);
  });

  it("falls back to base + priority when the RPC throws", async () => {
    // No compute budget ixs: price 0 => base fee only
    const tx = compile([transfer]);
    expect(await getTransactionFee(rpcError(), tx)).to.eq(5_000);
  });

  it("defaults the CU limit to 200k per instruction when no limit ix is set", async () => {
    // Price ix but no limit ix: runtime default is 200k per non-ComputeBudget
    // top-level instruction, so 2 transfers => 400k CU at 10k microlamports/CU
    // => priority 4000; base 5000 (1 sig)
    const tx = compile([
      ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 10_000 }),
      transfer,
      SystemProgram.transfer({ fromPubkey: from, toPubkey: to, lamports: 2 }),
    ]);
    expect(await getTransactionFee(rpcFee(null), tx)).to.eq(9_000);
  });

  it("falls back to base + the v1 header priority fee when no ComputeBudget ixs are present", async () => {
    // The v1 build moves both ixs into the header: priority = ceil(50k * 100k / 1e6) = 5000
    const tx = await toVersionedTx({
      feePayer: from,
      recentBlockhash: PublicKey.default.toBase58(),
      instructions: [
        ComputeBudgetProgram.setComputeUnitLimit({ units: 100_000 }),
        ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 50_000 }),
        transfer,
      ],
      addressLookupTables: [],
      version: 1,
    });
    expect(tx.version).to.eq(1);
    expect(tx.message.compiledInstructions).to.have.length(1);
    expect(await getTransactionFee(rpcError(), tx)).to.eq(10_000);
  });

  it("parses a compute-unit price above the 2^31 signed-int boundary", async () => {
    // 3_000_000_000 microlamports/CU exceeds 2^31; a signed 32-bit parse would
    // read it as negative and produce a bogus (negative) fee.
    const tx = compile([
      ComputeBudgetProgram.setComputeUnitLimit({ units: 1 }),
      ComputeBudgetProgram.setComputeUnitPrice({
        microLamports: 3_000_000_000,
      }),
      transfer,
    ]);
    // priority = ceil(3e9 * 1 / 1e6) = 3000; base 5000 (1 sig)
    expect(await getTransactionFee(rpcFee(null), tx)).to.eq(8_000);
  });
});

describe("getTotalTransactionFees", () => {
  it("sums cluster fees across transactions", async () => {
    const txs = [compile([transfer]), compile([transfer])];
    expect(await getTotalTransactionFees(rpcFee(6000), txs)).to.eq(12_000);
  });
});

describe("getRentLamports", () => {
  // A Connection on one fixed endpoint whose RPC answers with `body(id)`.
  const rpcConnection = (body: (id: unknown) => object) =>
    new Connection("http://rent-test.invalid", {
      fetch: (async (_url: unknown, init: { body: string }) => {
        const { id } = JSON.parse(init.body);
        return new Response(JSON.stringify(body(id)), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }) as unknown as typeof fetch,
    });

  it("rejects on a JSON-RPC error and does not cache it", async () => {
    const busy = rpcConnection((id) => ({
      jsonrpc: "2.0",
      id,
      error: { code: -32005, message: "busy" },
    }));
    let rejected = false;
    await getRentLamports(busy, 165).catch(() => {
      rejected = true;
    });
    expect(rejected).to.equal(true);

    const healthy = rpcConnection((id) => ({ jsonrpc: "2.0", id, result: 1_488_440 }));
    expect(await getRentLamports(healthy, 165)).to.equal(1_488_440);
  });
});
