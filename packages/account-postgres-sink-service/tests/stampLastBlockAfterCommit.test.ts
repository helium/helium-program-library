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

  it("does not throw when the restamp fails, since the rows are already committed", async () => {
    await stampLastBlockAfterCommit({
      connection: { getSlot: async () => 500 } as any,
      model: {
        sequelize: { transaction: async (fn: any) => fn({}) },
        update: async () => {
          throw new Error("connection lost");
        },
      } as any,
      addresses: ["addr0"],
    });
  });
});
