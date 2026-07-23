import EmbeddedPostgres from "embedded-postgres";
import type { Sequelize } from "sequelize";
import fs from "fs";
import net from "net";
import os from "os";
import path from "path";
import { Keypair } from "@solana/web3.js";

/**
 * Test seam for helium-vote-service.
 *
 * Spins up a real, throwaway Postgres (via embedded-postgres, no Docker/no
 * external server), points the service's Sequelize connection at it through
 * the PG* env vars, and creates the subset of the production schema the read
 * endpoints query. The service is then imported and driven via fastify
 * injection — no port bound, no Solana access, no proxies repo clone.
 *
 * Column names and types mirror what the account-postgres-sink writes in
 * production (e.g. vote_markers.choices is an integer[], proposals.choices is
 * a jsonb[]), because the endpoints run raw SQL against those shapes.
 */

/** Reserve an OS-assigned free port so parallel suites can't collide. */
const getFreePort = (): Promise<number> =>
  new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.once("error", reject);
    srv.listen(0, () => {
      const { port } = srv.address() as net.AddressInfo;
      srv.close(() => resolve(port));
    });
  });

/**
 * Boot an ephemeral Postgres and wire the process env to it. Must run before
 * the service module is imported, since ./src/model builds its Sequelize
 * instance from these env vars at import time. Returns a teardown function.
 */
export const startTestDb = async (): Promise<() => Promise<void>> => {
  const port = await getFreePort();
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "hvs-pg-"));

  const pg = new EmbeddedPostgres({
    databaseDir: dataDir,
    user: "postgres",
    password: "postgres",
    port,
    persistent: false,
  });

  await pg.initialise();
  await pg.start();
  await pg.createDatabase("votetest");

  process.env.PGHOST = "localhost";
  process.env.PGPORT = String(port);
  process.env.PGUSER = "postgres";
  process.env.PGPASSWORD = "postgres";
  process.env.PGDATABASE = "votetest";

  // The service reads a keypair at import time (src/solana.ts). Provide a
  // throwaway one so importing succeeds; it is never used to sign in tests.
  const keypairPath = path.join(dataDir, "test-keypair.json");
  fs.writeFileSync(
    keypairPath,
    JSON.stringify(Array.from(Keypair.generate().secretKey))
  );
  process.env.ANCHOR_WALLET = keypairPath;
  process.env.SOLANA_URL = "http://localhost:8899";
  process.env.NODE_ENV = "test";
  // Don't let the app try to alter/sync tables or run the vetokens view SQL.
  process.env.MODIFY_DB = "false";

  return async () => {
    await pg.stop();
    fs.rmSync(dataDir, { recursive: true, force: true });
  };
};

/**
 * Create the tables the read endpoints query. Types match production so the
 * raw SQL (unnest on integer[], jsonb[] indexing, ->> extraction) behaves as
 * it does against the real sink-written schema.
 */
export const applySchema = async (sequelize: Sequelize): Promise<void> => {
  await sequelize.query(`
    CREATE TABLE IF NOT EXISTS proposals (
      address TEXT PRIMARY KEY,
      namespace TEXT,
      choices JSONB[],
      name TEXT,
      created_at NUMERIC
    );

    CREATE TABLE IF NOT EXISTS vote_markers (
      address TEXT PRIMARY KEY,
      voter TEXT,
      registrar TEXT,
      proposal TEXT,
      mint TEXT,
      choices INTEGER[],
      weight NUMERIC,
      proxy_index INTEGER,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS proxies (
      wallet TEXT PRIMARY KEY,
      name TEXT,
      image TEXT,
      description TEXT,
      detail TEXT
    );

    CREATE TABLE IF NOT EXISTS proxy_assignments (
      address TEXT PRIMARY KEY,
      voter TEXT,
      next_voter TEXT,
      index INTEGER,
      asset TEXT,
      proxy_config TEXT,
      expiration_time NUMERIC
    );
  `);
};

export const truncateAll = async (sequelize: Sequelize): Promise<void> => {
  await sequelize.query(
    "TRUNCATE proposals, vote_markers, proxies, proxy_assignments"
  );
};

export interface SeedProposal {
  address: string;
  namespace?: string;
  name?: string;
  /** Choice names in order; index N maps to choice N. */
  choices: string[];
}

export const seedProposal = async (
  sequelize: Sequelize,
  p: SeedProposal
): Promise<void> => {
  const choicesJson = p.choices.map((name) => JSON.stringify({ name }));
  await sequelize.query(
    `INSERT INTO proposals (address, namespace, choices, name)
     VALUES (:address, :namespace, ARRAY[:choices]::jsonb[], :name)`,
    {
      replacements: {
        address: p.address,
        namespace: p.namespace ?? "namespace",
        choices: choicesJson,
        name: p.name ?? "Test Proposal",
      },
    }
  );
};

export interface SeedVoteMarker {
  address: string;
  voter: string;
  registrar?: string;
  proposal: string;
  mint?: string;
  choices: number[];
  weight: string | number;
  proxyIndex?: number;
}

export const seedVoteMarker = async (
  sequelize: Sequelize,
  m: SeedVoteMarker
): Promise<void> => {
  await sequelize.query(
    `INSERT INTO vote_markers
       (address, voter, registrar, proposal, mint, choices, weight, proxy_index)
     VALUES
       (:address, :voter, :registrar, :proposal, :mint, ARRAY[:choices]::integer[], :weight, :proxyIndex)`,
    {
      replacements: {
        address: m.address,
        voter: m.voter,
        registrar: m.registrar ?? "registrar",
        proposal: m.proposal,
        mint: m.mint ?? m.address,
        choices: m.choices,
        weight: String(m.weight),
        proxyIndex: m.proxyIndex ?? 0,
      },
    }
  );
};

/**
 * Some routes register @fastify/static against a proxies dir that only exists
 * at runtime after a repo clone. Create it so server.ready() doesn't throw.
 */
export const ensureProxiesDir = (): void => {
  const dir = path.join(__dirname, "..", "..", "helium-vote-proxies");
  fs.mkdirSync(dir, { recursive: true });
};
