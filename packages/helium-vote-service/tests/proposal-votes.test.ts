import { expect } from "chai";
import type { FastifyInstance } from "fastify";
import type { Sequelize } from "sequelize";
import {
  applySchema,
  ensureProxiesDir,
  seedProposal,
  seedVoteMarker,
  startTestDb,
  truncateAll,
} from "./helpers/db";

const PROPOSAL = "prop1111111111111111111111111111111111111111";
const OWNER = "owner1111111111111111111111111111111111111111";

describe("GET /v1/proposals/:proposal/votes", () => {
  let stopDb: () => Promise<void>;
  let server: FastifyInstance;
  let sequelize: Sequelize;

  before(async function () {
    this.timeout(60000);
    // Boot Postgres and wire env before importing the service, whose model
    // module builds its Sequelize connection from the PG* env vars at import.
    stopDb = await startTestDb();
    ensureProxiesDir();

    ({ sequelize } = await import("../src/model"));
    ({ server } = await import("../src/index"));

    await applySchema(sequelize);
    await server.ready();
  });

  after(async () => {
    if (server) await server.close();
    if (sequelize) await sequelize.close();
    if (stopDb) await stopDb();
  });

  beforeEach(async () => {
    await truncateAll(sequelize);
  });

  it("attributes a direct vote's weight to the casting wallet", async () => {
    await seedProposal(sequelize, {
      address: PROPOSAL,
      choices: ["Yes", "No"],
    });
    // Direct vote: the owner voted with their own wallet (proxy index 0).
    await seedVoteMarker(sequelize, {
      address: "marker11111111111111111111111111111111111111",
      voter: OWNER,
      proposal: PROPOSAL,
      choices: [0],
      weight: "100",
      proxyIndex: 0,
    });

    const res = await server.inject({
      method: "GET",
      url: `/v1/proposals/${PROPOSAL}/votes`,
    });

    expect(res.statusCode).to.equal(200);
    const body = res.json();
    expect(body).to.be.an("array").with.length(1);

    const [row] = body;
    expect(row.voter).to.equal(OWNER);
    expect(row.proposal).to.equal(PROPOSAL);
    expect(row.choice).to.equal(0);
    expect(row.choiceName).to.equal("Yes");
    expect(String(row.weight)).to.equal("100");
    // Owner is not a registered proxy, so no proxy name is attached.
    expect(row.proxyName).to.equal(null);
  });
});
