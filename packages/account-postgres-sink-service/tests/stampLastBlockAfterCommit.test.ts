import { expect } from "chai";
import { Op } from "sequelize";
import { stampLastBlockAfterCommit } from "../src/utils/stampLastBlockAfterCommit";

describe("stampLastBlockAfterCommit", () => {
  it("reads no slot and writes nothing when no row changed", async () => {
    let slotReads = 0;
    let updates = 0;
    await stampLastBlockAfterCommit({
      connection: { getSlot: async () => ++slotReads } as any,
      model: {
        sequelize: { transaction: async (fn: any) => fn({}) },
        update: async () => ++updates,
      } as any,
      addresses: [],
    });

    expect(slotReads).to.equal(0);
    expect(updates).to.equal(0);
  });

  it("restamps every address in chunks of 5000, guarded against lowering a row", async () => {
    const addresses = Array.from({ length: 5001 }, (_, i) => `addr${i}`);
    const updates: { values: any; where: any; transaction: any }[] = [];
    const tx = {};
    let transactions = 0;
    await stampLastBlockAfterCommit({
      connection: { getSlot: async () => 500 } as any,
      model: {
        sequelize: {
          transaction: async (fn: any) => {
            transactions++;
            return fn(tx);
          },
        },
        update: async (values: any, { where, transaction }: any) =>
          updates.push({ values, where, transaction }),
      } as any,
      addresses,
    });

    expect(updates.map(({ where }) => where.address.length)).to.deep.equal([
      5000, 1,
    ]);
    expect(updates.flatMap(({ where }) => where.address)).to.deep.equal(
      addresses,
    );
    for (const { values, where, transaction } of updates) {
      expect(values).to.deep.equal({ lastBlock: 500 });
      expect(where.lastBlock).to.deep.equal({ [Op.lt]: 500 });
      expect(transaction).to.equal(tx);
    }
    expect(transactions).to.equal(1);
  });

  it("does not throw when the restamp fails, since the rows are already committed, and does not retry a non-deadlock error", async () => {
    let transactions = 0;
    await stampLastBlockAfterCommit({
      connection: { getSlot: async () => 500 } as any,
      model: {
        sequelize: {
          transaction: async (fn: any) => {
            transactions++;
            return fn({});
          },
        },
        update: async () => {
          throw new Error("connection lost");
        },
      } as any,
      addresses: ["addr0"],
    });

    expect(transactions).to.equal(1);
  });

  it("bails on a getSlot failure without retrying the restamp", async () => {
    let slotReads = 0;
    let transactions = 0;
    await stampLastBlockAfterCommit({
      connection: {
        getSlot: async () => {
          slotReads++;
          throw new Error("rpc down");
        },
      } as any,
      model: {
        sequelize: {
          transaction: async (fn: any) => {
            transactions++;
            return fn({});
          },
        },
        update: async () => {},
      } as any,
      addresses: ["addr0"],
    });

    expect(slotReads).to.equal(4);
    expect(transactions).to.equal(0);
  });

  it("retries a deadlocked restamp with a fresh slot", async () => {
    const slots = [500, 600];
    let slotReads = 0;
    const updates: { values: any; where: any }[] = [];
    let transactions = 0;
    await stampLastBlockAfterCommit({
      connection: { getSlot: async () => slots[slotReads++] } as any,
      model: {
        sequelize: {
          transaction: async (fn: any) => {
            transactions++;
            return fn({});
          },
        },
        update: async (values: any, { where }: any) => {
          if (transactions === 1) {
            throw Object.assign(new Error("deadlock detected"), {
              parent: { code: "40P01" },
            });
          }
          updates.push({ values, where });
        },
      } as any,
      addresses: ["addr0"],
    });

    expect(transactions).to.equal(2);
    expect(updates).to.have.length.greaterThan(0);
    for (const { values, where } of updates) {
      expect(values).to.deep.equal({ lastBlock: 600 });
      expect(where.lastBlock).to.deep.equal({ [Op.lt]: 600 });
    }
  });
});
