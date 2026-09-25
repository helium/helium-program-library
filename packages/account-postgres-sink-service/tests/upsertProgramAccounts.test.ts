import { PublicKey } from "@solana/web3.js";
import axios from "axios";
import { expect } from "chai";
import http from "http";
import { AddressInfo } from "net";
import { Op } from "sequelize";
import { processProgramAccounts } from "../src/utils/processProgramAccounts";
import { makeUpsertChunk } from "../src/utils/upsertProgramAccounts";

const account = (pubkey: string) =>
  JSON.stringify({
    pubkey,
    account: { data: ["AAAA", "base64"], lamports: 1 },
  });

describe("makeUpsertChunk", () => {
  let server: http.Server;
  let interceptor: number;

  before(async () => {
    server = http.createServer((_req, res) => {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(
        `{"jsonrpc":"2.0","id":1,"result":[${account("a")},${account("b")}]}`,
      );
    });
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", () => resolve()),
    );
    // SOLANA_URL is fixed when src/env.ts loads, so send the gPA call to the fake RPC here.
    const { port } = server.address() as AddressInfo;
    interceptor = axios.interceptors.request.use((config) => ({
      ...config,
      url: `http://127.0.0.1:${port}`,
    }));
  });

  after(() => {
    axios.interceptors.request.eject(interceptor);
    server.close();
  });

  it("restamps only the changed row, in the batch transaction, above its write stamp", async () => {
    let slot = 100;
    const connection: any = { getSlot: async () => slot++ };
    const bulkCreates: { records: any[]; options: any }[] = [];
    const updates: { values: any; where: any; transaction: any }[] = [];
    const model: any = {
      // "b" is stored with the decoded value, DECIMAL read back as a string;
      // "a" has no row yet.
      findAll: async () => [
        {
          address: "b",
          elevation: "5",
          lastBlock: "50",
          refreshedAt: "2026-09-24T00:00:00.000Z",
          createdAt: "2026-01-01T00:00:00.000Z",
        },
      ],
      bulkCreate: async (records: any[], options: any) => {
        bulkCreates.push({ records, options });
      },
      update: async (values: any, { where, transaction }: any) => {
        updates.push({ values, where, transaction });
      },
    };
    const transactions: any[] = [];
    const sequelize: any = {
      models: { TestAccountV0: model },
      transaction: async () => {
        const t = { commit: async () => {}, rollback: async () => {} };
        transactions.push(t);
        return t;
      },
    };

    await processProgramAccounts(
      sequelize,
      connection,
      PublicKey.default,
      "TestAccountV0",
      [],
      2,
      makeUpsertChunk({
        model,
        decode: () => ({ elevation: 5 }),
        plugins: [],
        now: "2026-09-25T00:00:00.000Z",
        type: "TestAccountV0",
      }),
    );

    expect(transactions).to.have.length(1);
    const [t] = transactions;

    const written = bulkCreates.find(({ options }) =>
      options.updateOnDuplicate.includes("lastBlock"),
    )!;
    expect(written.records.map((r) => r.address)).to.deep.equal(["a"]);
    expect(written.options.transaction).to.equal(t);

    const touched = bulkCreates.find(
      ({ options }) => !options.updateOnDuplicate.includes("lastBlock"),
    )!;
    expect(touched.records.map((r) => r.address)).to.deep.equal(["b"]);
    expect(touched.options.updateOnDuplicate).to.deep.equal([
      "address",
      "refreshedAt",
    ]);

    expect(updates).to.have.length(1);
    const [{ values, where, transaction }] = updates;
    expect(where.address).to.deep.equal(["a"]);
    expect(transaction).to.equal(t);
    expect(values.lastBlock).to.be.greaterThan(written.records[0].lastBlock);
    expect(where.lastBlock[Op.lt]).to.equal(values.lastBlock);
  });
});
