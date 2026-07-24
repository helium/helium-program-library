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
import {
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
    // No compute budget ixs: default 200k CU at price 0 => base fee only
    const tx = compile([transfer]);
    expect(await getTransactionFee(rpcError(), tx)).to.eq(5_000);
  });

  it("parses a compute-unit price above the 2^31 signed-int boundary", async () => {
    // 3_000_000_000 microlamports/CU exceeds 2^31; a signed 32-bit parse would
    // read it as negative and produce a bogus (negative) fee.
    const tx = compile([
      ComputeBudgetProgram.setComputeUnitLimit({ units: 1 }),
      ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 3_000_000_000 }),
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
