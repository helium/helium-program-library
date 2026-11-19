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

/** A v0 transaction of `instructions` paid by a fresh key. */
const v0Tx = (
  instructions: TransactionInstruction[],
  tables: AddressLookupTableAccount[] = [],
): VersionedTransaction =>
  new VersionedTransaction(
    new TransactionMessage({
      payerKey: Keypair.generate().publicKey,
      recentBlockhash: BLOCKHASH,
      instructions,
    }).compileToV0Message(tables),
  );

/** An instruction of a fresh program with `keys` read-only accounts and `bytes` of data. */
const instruction = (bytes: number, keys: PublicKey[] = []) =>
  new TransactionInstruction({
    programId: Keypair.generate().publicKey,
    keys: keys.map((pubkey) => ({
      pubkey,
      isSigner: false,
      isWritable: false,
    })),
    data: Buffer.alloc(bytes, 1),
  });

describe("wireSize", () => {
  let wireSize: BuildModule["wireSize"];
  let v0WireSize: BuildModule["v0WireSize"];
  let isEncodingOverrun: BuildModule["isEncodingOverrun"];

  before(async () => {
    process.env.PG_USER = "test";
    process.env.PG_NAME = "test";
    process.env.PG_HOST = "localhost";
    process.env.PG_PORT = "5432";
    process.env.JUPITER_API_KEY = "test";
    process.env.NO_PG = "true";
    process.env.SOLANA_RPC_URL ??= "http://127.0.0.1:0";
    ({ wireSize, v0WireSize, isEncodingOverrun } =
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

  // web3.js encodes the instructions into a buffer of the packet size, and
  // when the limit falls on a one-byte field it throws an offset out of range
  // instead of "encoding overruns".
  it("counts a v0 transaction whose packet limit falls on an instruction's program index", () => {
    // The first instruction's encoding ends exactly at byte 1232 of the
    // instruction buffer: index (1), no accounts (1), data length (2), data
    // (1228).
    const past = v0Tx([instruction(1228), instruction(4)]);

    expect(() => past.serialize()).to.throw(/out of range/);
    expect(wireSize(past)).to.eq(1439);
  });

  it("counts a v0 transaction whose packet limit falls inside an instruction's account indexes", () => {
    const table = lookupTable(200);
    const past = v0Tx(
      [instruction(1150), instruction(4, table.state.addresses)],
      [table],
    );

    expect(() => past.serialize()).to.throw(/out of range/);
    expect(wireSize(past)).to.eq(1797);
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

  it("sizes a v0 transaction of the given instructions and tables alone", () => {
    const table = lookupTable(20);
    const feePayer = Keypair.generate().publicKey;
    const instructions = [instruction(900, table.state.addresses)];
    const built = new VersionedTransaction(
      new TransactionMessage({
        payerKey: feePayer,
        recentBlockhash: BLOCKHASH,
        instructions,
      }).compileToV0Message([table]),
    );

    expect(
      v0WireSize({ instructions, feePayer, addressLookupTables: [table] }),
    ).to.eq(built.serialize().length);
    // Without the table its 20 addresses are static keys (32 bytes each),
    // and its lookup (the table key, two index-list lengths and 20 indexes)
    // is gone.
    expect(
      v0WireSize({ instructions, feePayer, addressLookupTables: [] }),
    ).to.eq(built.serialize().length + 20 * 32 - (32 + 2 + 20));
    // Past the packet limit it is counted.
    expect(
      v0WireSize({
        instructions: [instruction(1400)],
        feePayer,
        addressLookupTables: [],
      }),
    ).to.eq(wireSize(v0Tx([instruction(1400)])));
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
