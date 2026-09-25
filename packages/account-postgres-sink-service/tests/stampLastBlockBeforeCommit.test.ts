import { expect } from "chai";
import { Op } from "sequelize";
import { stampLastBlockBeforeCommit } from "../src/utils/stampLastBlockBeforeCommit";

describe("stampLastBlockBeforeCommit", () => {
  it("reads no slot and writes nothing when no row changed", async () => {
    let slotReads = 0;
    let updates = 0;
    await stampLastBlockBeforeCommit({
      connection: { getSlot: async () => ++slotReads } as any,
      model: { update: async () => ++updates } as any,
      addresses: [],
      transaction: {} as any,
    });

    expect(slotReads).to.equal(0);
    expect(updates).to.equal(0);
  });

  it("restamps every address in chunks of 5000 in the batch transaction, guarded against lowering a row", async () => {
    const addresses = Array.from({ length: 5001 }, (_, i) => `addr${i}`);
    const updates: { values: any; where: any; transaction: any }[] = [];
    const tx: any = {};
    await stampLastBlockBeforeCommit({
      connection: { getSlot: async () => 500 } as any,
      model: {
        update: async (values: any, { where, transaction }: any) =>
          updates.push({ values, where, transaction }),
      } as any,
      addresses,
      transaction: tx,
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
  });

  it("throws when the update fails, so the batch rolls back", async () => {
    let error: any;
    await stampLastBlockBeforeCommit({
      connection: { getSlot: async () => 500 } as any,
      model: {
        update: async () => {
          throw new Error("connection lost");
        },
      } as any,
      addresses: ["addr0"],
      transaction: {} as any,
    }).catch((e) => (error = e));

    expect(error?.message).to.equal("connection lost");
  });

  it("throws after retrying a getSlot failure, without an update", async () => {
    let slotReads = 0;
    let updates = 0;
    let error: any;
    await stampLastBlockBeforeCommit({
      connection: {
        getSlot: async () => {
          slotReads++;
          throw new Error("rpc down");
        },
      } as any,
      model: { update: async () => ++updates } as any,
      addresses: ["addr0"],
      transaction: {} as any,
    }).catch((e) => (error = e));

    expect(error?.message).to.equal("rpc down");
    expect(slotReads).to.equal(4);
    expect(updates).to.equal(0);
  });
});
