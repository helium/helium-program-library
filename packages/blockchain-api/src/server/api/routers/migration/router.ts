import { getHotspots } from "./procedures/getHotspots";
import { migrate } from "./procedures/migrate";
import { migrationContract } from "@helium/blockchain-api/contracts";
import { implement } from "@orpc/server";

export const migrationRouter = implement(migrationContract).router({
  getHotspots,
  migrate,
});
