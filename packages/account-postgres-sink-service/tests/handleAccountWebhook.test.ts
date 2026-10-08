import { PublicKey } from "@solana/web3.js";
import { expect } from "chai";
import cachedIdlFetch from "../src/utils/cachedIdlFetch";
import { handleAccountWebhook } from "../src/utils/handleAccountWebhook";
import { provider } from "../src/utils/solana";

describe("handleAccountWebhook", () => {
  it("rolls back instead of writing lastBlock 0 when the slot read fails", async () => {
    const discriminator = [1, 2, 3, 4, 5, 6, 7, 8];
    const idl: any = {
      address: PublicKey.default.toBase58(),
      metadata: { name: "test", version: "0.1.0", spec: "0.1.0" },
      instructions: [],
      accounts: [{ name: "TestAccountV0", discriminator }],
      types: [
        {
          name: "TestAccountV0",
          type: { kind: "struct", fields: [{ name: "elevation", type: "u8" }] },
        },
      ],
    };
    const realFetchIdl = cachedIdlFetch.fetchIdl;
    const realGetSlot = provider.connection.getSlot;
    cachedIdlFetch.fetchIdl = async () => idl;
    // getFinalizedSlot's first read and its 3 retries all fail.
    provider.connection.getSlot = async () => {
      throw new Error("rpc down");
    };
    const events: string[] = [];
    const sequelize: any = {
      models: {
        TestAccountV0: {
          findByPk: async () => null,
          upsert: async () => events.push("upsert"),
        },
      },
      transaction: async () => ({
        commit: async () => events.push("commit"),
        rollback: async () => events.push("rollback"),
      }),
    };

    let rejected: any;
    try {
      await handleAccountWebhook({
        fastify: {
          customMetrics: { accountWebhookCounter: { inc: () => {} } },
        } as any,
        programId: PublicKey.default,
        accounts: [{ type: "TestAccountV0" } as any],
        account: {
          pubkey: "a",
          data: [
            Buffer.from([...discriminator, 5]).toString("base64"),
            "base64",
          ],
        },
        sequelize,
        pluginsByAccountType: {},
      });
    } catch (err) {
      rejected = err;
    } finally {
      cachedIdlFetch.fetchIdl = realFetchIdl;
      provider.connection.getSlot = realGetSlot;
    }

    expect(rejected?.message).to.equal("rpc down");
    expect(events).to.deep.equal(["rollback"]);
  });

  it("skips the upsert and the slot read when the account has not changed", async () => {
    const discriminator = [1, 2, 3, 4, 5, 6, 7, 8];
    const idl: any = {
      address: PublicKey.default.toBase58(),
      metadata: { name: "test", version: "0.1.0", spec: "0.1.0" },
      instructions: [],
      accounts: [{ name: "TestAccountV0", discriminator }],
      types: [
        {
          name: "TestAccountV0",
          type: { kind: "struct", fields: [{ name: "elevation", type: "u8" }] },
        },
      ],
    };
    const realFetchIdl = cachedIdlFetch.fetchIdl;
    const realGetSlot = provider.connection.getSlot;
    cachedIdlFetch.fetchIdl = async () => idl;
    const events: string[] = [];
    provider.connection.getSlot = async () => {
      events.push("getSlot");
      return 100;
    };
    const sequelize: any = {
      models: {
        TestAccountV0: {
          // The stored row matches the decoded account; only omitted keys differ.
          findByPk: async () => ({
            dataValues: {
              address: "a",
              elevation: 5,
              createdAt: "2020-01-01T00:00:00.000Z",
              refreshedAt: "2020-01-01T00:00:00.000Z",
              lastBlock: 42,
            },
          }),
          upsert: async () => events.push("upsert"),
        },
      },
      transaction: async () => ({
        commit: async () => events.push("commit"),
        rollback: async () => events.push("rollback"),
      }),
    };

    try {
      await handleAccountWebhook({
        fastify: {
          customMetrics: { accountWebhookCounter: { inc: () => {} } },
        } as any,
        programId: PublicKey.default,
        accounts: [{ type: "TestAccountV0" } as any],
        account: {
          pubkey: "a",
          data: [
            Buffer.from([...discriminator, 5]).toString("base64"),
            "base64",
          ],
        },
        sequelize,
        pluginsByAccountType: {},
      });
    } finally {
      cachedIdlFetch.fetchIdl = realFetchIdl;
      provider.connection.getSlot = realGetSlot;
    }

    expect(events).to.deep.equal(["commit"]);
  });
});
