import { init as initTuktuk, PROGRAM_ID } from "@helium/tuktuk-sdk";
import {
  AccountInfo,
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
} from "@solana/web3.js";
import { expect } from "chai";
import { describe, it } from "mocha";
import { fetchTaskRentRefunds } from "../../src/server/api/routers/governance/procedures/helpers/claim-bot-accounts";

const account = (owner: PublicKey, data: Buffer): AccountInfo<Buffer> => ({
  executable: false,
  lamports: 1_000_000,
  owner,
  data,
});

/** A connection that serves `accounts` by address and records the keys of each read. */
const fakeConnection = (accounts: Map<string, AccountInfo<Buffer>>) => {
  const reads: string[][] = [];
  const connection = {
    getMultipleAccountsInfo: async (keys: PublicKey[]) => {
      reads.push(keys.map((key) => key.toBase58()));
      return keys.map((key) => accounts.get(key.toBase58()) ?? null);
    },
  } as unknown as Connection;

  return { reads, connection };
};

// The tuktuk IDL is not available to a unit test, so this coder reads a task whose data is
// only its rent refund. It throws on empty data, as the real coder does.
const tuktukProgram = {
  coder: {
    accounts: {
      decode: (name: string, data: Buffer) => {
        expect(name).to.equal("taskV0");
        return { rentRefund: new PublicKey(data) };
      },
    },
  },
} as unknown as Awaited<ReturnType<typeof initTuktuk>>;

const taskAccount = (rentRefund: PublicKey) =>
  account(PROGRAM_ID, rentRefund.toBuffer());

describe("fetchTaskRentRefunds", () => {
  it("returns the rent refund a task account names", async () => {
    const task = Keypair.generate().publicKey;
    const rentRefund = Keypair.generate().publicKey;
    const accounts = new Map<string, AccountInfo<Buffer>>();
    const { connection } = fakeConnection(accounts);
    accounts.set(task.toBase58(), taskAccount(rentRefund));

    const refunds = await fetchTaskRentRefunds(connection, tuktukProgram, [
      task,
    ]);

    expect(refunds.size).to.equal(1);
    expect(refunds.get(task.toBase58())?.toBase58()).to.equal(
      rentRefund.toBase58(),
    );
  });

  it("has no entry for a task account that does not exist", async () => {
    const { connection } = fakeConnection(new Map());

    const refunds = await fetchTaskRentRefunds(connection, tuktukProgram, [
      Keypair.generate().publicKey,
    ]);

    expect(refunds.size).to.equal(0);
  });

  it("has no entry for an address that holds lamports and no data", async () => {
    const task = Keypair.generate().publicKey;
    const { connection } = fakeConnection(
      new Map([
        [task.toBase58(), account(SystemProgram.programId, Buffer.alloc(0))],
      ]),
    );

    const refunds = await fetchTaskRentRefunds(connection, tuktukProgram, [
      task,
    ]);

    expect(refunds.size).to.equal(0);
  });

  it("reads more than 100 keys in more than one call", async () => {
    const tasks = Array.from(
      { length: 101 },
      () => Keypair.generate().publicKey,
    );
    const rentRefund = Keypair.generate().publicKey;
    const accounts = new Map<string, AccountInfo<Buffer>>();
    const { reads, connection } = fakeConnection(accounts);
    // Only the key past the first 100 holds a task, so its entry proves the second read.
    accounts.set(tasks[100].toBase58(), taskAccount(rentRefund));

    const refunds = await fetchTaskRentRefunds(
      connection,
      tuktukProgram,
      tasks,
    );

    expect(reads.map((keys) => keys.length)).to.deep.equal([100, 1]);
    expect(refunds.size).to.equal(1);
    expect(refunds.get(tasks[100].toBase58())?.toBase58()).to.equal(
      rentRefund.toBase58(),
    );
  });
});
