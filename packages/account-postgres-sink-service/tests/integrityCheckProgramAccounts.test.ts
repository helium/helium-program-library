import { expect } from "chai";
import { Op } from "sequelize";
import {
  IntegrityCorrection,
  correctAccountsOfType,
} from "../src/utils/integrityCheckProgramAccounts";

const row = (dataValues: Record<string, any>) => ({
  dataValues,
  get: (key: string) => dataValues[key],
});

describe("correctAccountsOfType", () => {
  it("restamps exactly the corrected rows, in the batch transaction, before commit", async () => {
    const snapshotTime = new Date();
    const stale = new Date(snapshotTime.getTime() - 48 * 60 * 60 * 1000);
    const events: string[] = [];
    let slot = 100;
    const connection: any = {
      getSlot: async () => {
        const s = slot++;
        events.push(`slot ${s}`);
        return s;
      },
    };
    const bulkCreates: { records: any[]; options: any }[] = [];
    const updates: { values: any; where: any; transaction: any }[] = [];
    const model: any = {
      findAll: async () => [
        // Refreshed after the threshold, so it is skipped.
        row({ address: "Y", elevation: 1, refreshedAt: snapshotTime }),
        // Stale but equal to the chain, so it is not corrected.
        row({ address: "Z", elevation: 5, refreshedAt: stale }),
      ],
      findOne: async () => null,
      bulkCreate: async (records: any[], options: any) => {
        events.push("bulkCreate");
        bulkCreates.push({ records, options });
      },
      update: async (values: any, { where, transaction }: any) => {
        events.push("update");
        updates.push({ values, where, transaction });
      },
    };
    const t: any = {
      commit: async () => events.push("commit"),
      rollback: async () => events.push("rollback"),
    };
    const sequelize: any = {
      models: { TestAccountV0: model },
      transaction: async () => t,
    };
    const corrections: IntegrityCorrection[] = [];

    await correctAccountsOfType({
      connection,
      sequelize,
      program: {
        coder: { accounts: { decode: () => ({ elevation: 5 }) } },
      } as any,
      accName: "TestAccountV0",
      accounts: ["X", "Y", "Z"].map((pubkey) => ({
        pubkey,
        data: Buffer.alloc(0),
      })),
      plugins: [],
      refreshThreshold: new Date(snapshotTime.getTime() - 60 * 60 * 1000),
      snapshotTime,
      snapshotSlot: 1000,
      txIdsByAccountId: {},
      corrections,
    });

    expect(corrections.map((c) => c.accountId)).to.deep.equal(["X"]);
    expect(bulkCreates).to.have.length(1);
    expect(bulkCreates[0].records.map((r) => r.address)).to.deep.equal(["X"]);

    expect(updates).to.have.length(1);
    const [{ values, where, transaction }] = updates;
    expect(where.address).to.deep.equal(["X"]);
    expect(transaction).to.equal(t);
    expect(values.lastBlock).to.be.greaterThan(
      bulkCreates[0].records[0].lastBlock,
    );
    expect(where.lastBlock[Op.lt]).to.equal(values.lastBlock);
    expect(events).to.deep.equal([
      "slot 100",
      "bulkCreate",
      "slot 101",
      "update",
      "commit",
    ]);
  });
});
