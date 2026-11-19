import {
  AddressLookupTableAccount,
  Keypair,
  PACKET_DATA_SIZE,
  PublicKey,
  TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
} from "@solana/web3.js";
import { expect } from "chai";
import { before, describe, it } from "mocha";

/**
 * Type-only, so naming the helpers here does not import them: the module
 * reads a validated env at load, which only exists once `before` has set one
 * up.
 */
type BuildModule = typeof import("../../src/lib/utils/build-transaction");

const BLOCKHASH = "EkSnNWid2cvwEVnVx9aBqawnmiCNiDgp3gUdkDPTKN1N";
const MEMO_PROGRAM = new PublicKey(
  "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr",
);

/** A one-signer transaction whose memo carries `bytes` bytes of data. */
const memoTx = (
  bytes: number,
  {
    legacy = false,
    accounts = 0,
    table,
  }: {
    legacy?: boolean;
    accounts?: number;
    table?: AddressLookupTableAccount;
  } = {},
): VersionedTransaction => {
  const payer = Keypair.generate().publicKey;
  const keys = [
    ...Array.from({ length: accounts }, () => Keypair.generate().publicKey),
    ...(table?.state.addresses ?? []),
  ].map((pubkey) => ({ pubkey, isSigner: false, isWritable: false }));
  const message = new TransactionMessage({
    payerKey: payer,
    recentBlockhash: BLOCKHASH,
    instructions: [
      new TransactionInstruction({
        programId: MEMO_PROGRAM,
        keys,
        data: Buffer.alloc(bytes, 1),
      }),
    ],
  });
  return new VersionedTransaction(
    legacy
      ? message.compileToLegacyMessage()
      : message.compileToV0Message(table ? [table] : []),
  );
};

const lookupTable = (size: number) =>
  new AddressLookupTableAccount({
    key: Keypair.generate().publicKey,
    state: {
      deactivationSlot: BigInt("18446744073709551615"),
      lastExtendedSlot: 0,
      lastExtendedSlotStartIndex: 0,
      addresses: Array.from(
        { length: size },
        () => Keypair.generate().publicKey,
      ),
    },
  });

describe("wireSize", () => {
  let wireSize: BuildModule["wireSize"];
  let isEncodingOverrun: BuildModule["isEncodingOverrun"];

  before(async () => {
    process.env.PG_USER = "test";
    process.env.PG_NAME = "test";
    process.env.PG_HOST = "localhost";
    process.env.PG_PORT = "5432";
    process.env.JUPITER_API_KEY = "test";
    process.env.NO_PG = "true";
    process.env.SOLANA_RPC_URL ??= "http://127.0.0.1:0";
    ({ wireSize, isEncodingOverrun } =
      await import("../../src/lib/utils/build-transaction"));
  });

  it("is the serialized length of a transaction that fits", () => {
    for (const tx of [
      memoTx(0),
      memoTx(127),
      memoTx(128),
      memoTx(900),
      memoTx(10, { legacy: true }),
      memoTx(10, { accounts: 3 }),
      memoTx(10, { table: lookupTable(200) }),
    ]) {
      expect(wireSize(tx)).to.eq(tx.serialize().length);
    }
  });

  it("counts a v0 transaction whose message is past the packet limit", () => {
    const table = lookupTable(20);
    const fits = memoTx(900, { table });
    const past = memoTx(1400, { table });

    expect(() => past.serialize()).to.throw(/encoding overruns/);
    expect(wireSize(past)).to.eq(fits.serialize().length + 500);
  });

  it("rethrows a legacy transaction whose message is past the packet limit", () => {
    const past = memoTx(1400, { legacy: true });

    expect(() => wireSize(past)).to.throw(/out of range/);
  });

  it("counts every account key past the packet limit", () => {
    const fits = memoTx(10, { accounts: 30 });
    const past = memoTx(10, { accounts: 50 });

    expect(() => past.serialize()).to.throw(/encoding overruns/);
    expect(wireSize(past)).to.eq(fits.serialize().length + 20 * 32 + 20);
  });

  it("rethrows a serialization failure that is not an overrun", () => {
    const tx = memoTx(10);
    tx.serialize = () => {
      throw new Error("boom");
    };

    expect(() => wireSize(tx)).to.throw("boom");
  });

  it("recognises web3.js's overrun and nothing else", () => {
    let overrun: unknown;
    try {
      memoTx(PACKET_DATA_SIZE).serialize();
    } catch (error) {
      overrun = error;
    }

    expect(isEncodingOverrun(overrun)).to.eq(true);
    expect(isEncodingOverrun(new Error("boom"))).to.eq(false);
    expect(isEncodingOverrun("encoding overruns Uint8Array")).to.eq(true);
  });
});
