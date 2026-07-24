import { expect } from "chai";
import type { FastifyInstance } from "fastify";
import type { Sequelize } from "sequelize";
import {
  applySchema,
  ensureProxiesDir,
  seedProposal,
  seedProxy,
  seedProxyAssignment,
  seedVoteMarker,
  startTestDb,
  truncateAll,
} from "./helpers/db";

const PROPOSAL = "prop1111111111111111111111111111111111111111";
const OWNER = "owner1111111111111111111111111111111111111111";
const PROXY = "proxy1111111111111111111111111111111111111111";
const MINT_A = "mintA1111111111111111111111111111111111111111";
const MINT_B = "mintB1111111111111111111111111111111111111111";

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
    await seedProposal(sequelize, {
      address: PROPOSAL,
      choices: ["Yes", "No"],
    });
  });

  const getVotes = async () => {
    const res = await server.inject({
      method: "GET",
      url: `/v1/proposals/${PROPOSAL}/votes`,
    });
    expect(res.statusCode).to.equal(200);
    return res.json();
  };

  it("attributes a direct vote's weight to the casting voter", async () => {
    // Direct vote: the owner voted with their own wallet (proxy index 0).
    await seedVoteMarker(sequelize, {
      address: "marker11111111111111111111111111111111111111",
      voter: OWNER,
      proposal: PROPOSAL,
      choices: [0],
      weight: "100",
      proxyIndex: 0,
    });

    const body = await getVotes();
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

  describe("owner attribution (ADR 0003)", () => {
    it("keeps direct-vote attribution unchanged and lists no casting proxy", async () => {
      // Owner voted with their own wallet; index-0 assignment names them.
      await seedProxyAssignment(sequelize, {
        address: "pa0mintA1111111111111111111111111111111111111",
        voter: OWNER,
        index: 0,
        asset: MINT_A,
      });
      await seedVoteMarker(sequelize, {
        address: "markerA1111111111111111111111111111111111111",
        voter: OWNER,
        proposal: PROPOSAL,
        mint: MINT_A,
        choices: [0],
        weight: "100",
        proxyIndex: 0,
      });

      const body = await getVotes();

      expect(body).to.have.length(1);
      expect(body[0].voter).to.equal(OWNER);
      expect(body[0].castingProxies).to.deep.equal([]);
    });

    it("attributes a proxied vote to the position owner and lists the casting proxy", async () => {
      await seedProxy(sequelize, { wallet: PROXY, name: "Proxy One" });
      await seedProxyAssignment(sequelize, {
        address: "pa0mintA1111111111111111111111111111111111111",
        voter: OWNER,
        index: 0,
        asset: MINT_A,
        nextVoter: PROXY,
      });
      await seedProxyAssignment(sequelize, {
        address: "pa1mintA1111111111111111111111111111111111111",
        voter: PROXY,
        index: 1,
        asset: MINT_A,
      });
      await seedVoteMarker(sequelize, {
        address: "markerA1111111111111111111111111111111111111",
        voter: PROXY,
        proposal: PROPOSAL,
        mint: MINT_A,
        choices: [0],
        weight: "100",
        proxyIndex: 1,
      });

      const body = await getVotes();

      // Exactly one row: the weight appears once, under the owner — the
      // proxy's row no longer accumulates proxied weight.
      expect(body).to.have.length(1);
      const [row] = body;
      expect(row.voter).to.equal(OWNER);
      expect(String(row.weight)).to.equal("100");
      expect(row.castingProxies).to.deep.equal([
        { wallet: PROXY, name: "Proxy One" },
      ]);
      // The owner is not themselves a registered proxy.
      expect(row.proxyName).to.equal(null);
    });

    it("merges a wallet's direct and proxied votes into one owner row listing the casting proxies", async () => {
      await seedProxy(sequelize, { wallet: PROXY, name: "Proxy One" });
      // Position A voted directly by the owner.
      await seedProxyAssignment(sequelize, {
        address: "pa0mintA1111111111111111111111111111111111111",
        voter: OWNER,
        index: 0,
        asset: MINT_A,
      });
      await seedVoteMarker(sequelize, {
        address: "markerA1111111111111111111111111111111111111",
        voter: OWNER,
        proposal: PROPOSAL,
        mint: MINT_A,
        choices: [0],
        weight: "100",
        proxyIndex: 0,
      });
      // Position B voted by the proxy.
      await seedProxyAssignment(sequelize, {
        address: "pa0mintB1111111111111111111111111111111111111",
        voter: OWNER,
        index: 0,
        asset: MINT_B,
        nextVoter: PROXY,
      });
      await seedVoteMarker(sequelize, {
        address: "markerB1111111111111111111111111111111111111",
        voter: PROXY,
        proposal: PROPOSAL,
        mint: MINT_B,
        choices: [0],
        weight: "200",
        proxyIndex: 1,
      });

      const body = await getVotes();

      expect(body).to.have.length(1);
      const [row] = body;
      expect(row.voter).to.equal(OWNER);
      expect(String(row.weight)).to.equal("300");
      expect(row.castingProxies).to.deep.equal([
        { wallet: PROXY, name: "Proxy One" },
      ]);
    });

    it("still attributes to the owner when the index-0 assignment has expired", async () => {
      await seedProxyAssignment(sequelize, {
        address: "pa0mintA1111111111111111111111111111111111111",
        voter: OWNER,
        index: 0,
        asset: MINT_A,
        expirationTime: Math.floor(Date.now() / 1000) - 24 * 60 * 60,
      });
      await seedVoteMarker(sequelize, {
        address: "markerA1111111111111111111111111111111111111",
        voter: PROXY,
        proposal: PROPOSAL,
        mint: MINT_A,
        choices: [0],
        weight: "100",
        proxyIndex: 1,
      });

      const body = await getVotes();

      expect(body).to.have.length(1);
      expect(body[0].voter).to.equal(OWNER);
    });

    it("falls back to the casting voter when the index-0 assignment is missing", async () => {
      await seedVoteMarker(sequelize, {
        address: "markerA1111111111111111111111111111111111111",
        voter: PROXY,
        proposal: PROPOSAL,
        mint: MINT_A,
        choices: [0],
        weight: "100",
        proxyIndex: 1,
      });

      const body = await getVotes();

      expect(body).to.have.length(1);
      expect(body[0].voter).to.equal(PROXY);
      // Attribution degraded to the casting voter, so there is no separate
      // casting proxy to report.
      expect(body[0].castingProxies).to.deep.equal([]);
    });

    it("populates proxyName against the owner wallet when the owner is a registered proxy", async () => {
      await seedProxy(sequelize, { wallet: OWNER, name: "Owner The Proxy" });
      await seedProxyAssignment(sequelize, {
        address: "pa0mintA1111111111111111111111111111111111111",
        voter: OWNER,
        index: 0,
        asset: MINT_A,
      });
      await seedVoteMarker(sequelize, {
        address: "markerA1111111111111111111111111111111111111",
        voter: PROXY,
        proposal: PROPOSAL,
        mint: MINT_A,
        choices: [0],
        weight: "100",
        proxyIndex: 1,
      });

      const body = await getVotes();

      expect(body).to.have.length(1);
      expect(body[0].voter).to.equal(OWNER);
      expect(body[0].proxyName).to.equal("Owner The Proxy");
    });

    it("counts weight exactly once when the asset has index-0 assignments under multiple proxy configs", async () => {
      await seedProxyAssignment(sequelize, {
        address: "pa0mintAcfg111111111111111111111111111111111",
        voter: OWNER,
        index: 0,
        asset: MINT_A,
        proxyConfig: "proxyConfig1",
      });
      await seedProxyAssignment(sequelize, {
        address: "pa0mintAcfg211111111111111111111111111111111",
        voter: OWNER,
        index: 0,
        asset: MINT_A,
        proxyConfig: "proxyConfig2",
      });
      await seedVoteMarker(sequelize, {
        address: "markerA1111111111111111111111111111111111111",
        voter: PROXY,
        proposal: PROPOSAL,
        mint: MINT_A,
        choices: [0],
        weight: "100",
        proxyIndex: 1,
      });

      const body = await getVotes();

      expect(body).to.have.length(1);
      expect(body[0].voter).to.equal(OWNER);
      expect(String(body[0].weight)).to.equal("100");
    });

    it("attributes to the freshest index-0 voter when stale rows disagree", async () => {
      const nowSeconds = Math.floor(Date.now() / 1000);
      await seedProxyAssignment(sequelize, {
        address: "pa0mintAstale111111111111111111111111111111",
        voter: PROXY,
        index: 0,
        asset: MINT_A,
        proxyConfig: "proxyConfig1",
        expirationTime: nowSeconds + 60 * 60,
      });
      await seedProxyAssignment(sequelize, {
        address: "pa0mintAfresh111111111111111111111111111111",
        voter: OWNER,
        index: 0,
        asset: MINT_A,
        proxyConfig: "proxyConfig2",
        expirationTime: nowSeconds + 24 * 60 * 60,
      });
      await seedVoteMarker(sequelize, {
        address: "markerA1111111111111111111111111111111111111",
        voter: PROXY,
        proposal: PROPOSAL,
        mint: MINT_A,
        choices: [0],
        weight: "100",
        proxyIndex: 1,
      });

      const body = await getVotes();

      expect(body).to.have.length(1);
      expect(body[0].voter).to.equal(OWNER);
    });

    it("keeps the response structurally backward-compatible (additive fields only)", async () => {
      await seedVoteMarker(sequelize, {
        address: "markerA1111111111111111111111111111111111111",
        voter: OWNER,
        proposal: PROPOSAL,
        mint: MINT_A,
        choices: [0],
        weight: "100",
        proxyIndex: 0,
      });

      const body = await getVotes();

      expect(body[0]).to.have.all.keys(
        "voter",
        "registrar",
        "proposal",
        "weight",
        "choice",
        "choiceName",
        "proxyName",
        "castingProxies"
      );
    });
  });
});
