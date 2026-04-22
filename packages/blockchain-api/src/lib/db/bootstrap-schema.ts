import fs from "fs";
import path from "path";
import { sequelize } from "../db";
import { env } from "../env";

let bootstrapped = false;

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
