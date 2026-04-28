import fs from "fs";
import path from "path";
import { sequelize } from "../db";
import { env } from "../env";

let bootstrapped = false;

// `proxies` and `proxy_registrars` are written to by the proxy-sync background job
// (not the account-postgres-sink). The Sequelize models declare circular hasMany
// associations between them, which causes `Model.sync` to emit foreign keys in both
// directions and deadlock table creation. Create them with plain SQL so the order
// is deterministic and the queries that the proxy-sync job runs work end-to-end.
const PROXY_TABLES_SQL = `
  CREATE TABLE IF NOT EXISTS proxies (
    name VARCHAR(255) UNIQUE,
    image VARCHAR(255),
    wallet VARCHAR(255) PRIMARY KEY,
    description VARCHAR(255),
    detail VARCHAR(255),
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL
  );

  CREATE TABLE IF NOT EXISTS proxy_registrars (
    id SERIAL PRIMARY KEY,
    registrar VARCHAR(255) NOT NULL,
    wallet VARCHAR(255) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL
  );

  CREATE UNIQUE INDEX IF NOT EXISTS idx_proxy_registrars_registrar_wallet
    ON proxy_registrars(registrar, wallet);
  CREATE INDEX IF NOT EXISTS idx_proxy_registrars_registrar
    ON proxy_registrars(registrar);
  CREATE INDEX IF NOT EXISTS idx_proxy_registrars_wallet
    ON proxy_registrars(wallet);
`;

export async function bootstrapGovernanceSchema(): Promise<void> {
  if (bootstrapped) return;
  bootstrapped = true;

  if (env.MODIFY_DB !== "true") {
    console.log(
      "Governance schema bootstrap skipped (set MODIFY_DB=true to enable)",
    );
    return;
  }

  try {
    await sequelize.query(PROXY_TABLES_SQL);
    console.log(
      "Governance schema bootstrap: proxies / proxy_registrars tables ready",
    );

    // View built on top of sink-populated `positions` and `registrars`.
    const sqlPath = path.join(__dirname, "positions_with_vetokens.sql");
    const sql = fs.readFileSync(sqlPath, "utf8");
    await sequelize.query(sql);
    console.log(
      "Governance schema bootstrap: positions_with_vetokens view ready",
    );
  } catch (err) {
    console.error("Failed to bootstrap governance schema:", err);
    throw err;
  }
}
