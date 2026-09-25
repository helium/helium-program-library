import { expect } from "chai";
import { Op } from "sequelize";
import { stampLastBlockAfterCommit } from "../src/utils/stampLastBlockAfterCommit";

describe("stampLastBlockAfterCommit", () => {
  it("reads no slot and writes nothing when no row changed", async () => {
    let slotReads = 0;
    let updates = 0;
    await stampLastBlockAfterCommit({
      connection: { getSlot: async () => ++slotReads } as any,
      model: { update: async () => ++updates } as any,
      addresses: [],
    });

    expect(slotReads).to.equal(0);
    expect(updates).to.equal(0);
  });

  it("restamps every address in chunks of 5000, guarded against lowering a row", async () => {
    const addresses = Array.from({ length: 5001 }, (_, i) => `addr${i}`);
    const updates: { values: any; where: any }[] = [];
    await stampLastBlockAfterCommit({
      connection: { getSlot: async () => 500 } as any,
      model: {
        update: async (values: any, { where }: any) =>
          updates.push({ values, where }),
      } as any,
      addresses,
    });

    expect(updates.map(({ where }) => where.address.length)).to.deep.equal([
      5000, 1,
    ]);
    expect(updates.flatMap(({ where }) => where.address)).to.deep.equal(
      addresses,
    );
    for (const { values, where } of updates) {
      expect(values).to.deep.equal({ lastBlock: 500 });
      expect(where.lastBlock).to.deep.equal({ [Op.lt]: 500 });
    }
  });

  it("does not throw when the restamp fails, since the rows are already committed", async () => {
    await stampLastBlockAfterCommit({
      connection: { getSlot: async () => 500 } as any,
      model: {
        update: async () => {
          throw new Error("connection lost");
        },
      } as any,
      addresses: ["addr0"],
    });
  });
});
