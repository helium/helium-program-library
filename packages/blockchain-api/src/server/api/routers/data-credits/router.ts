import { mint } from "./procedures/mint";
import { delegate } from "./procedures/delegate";
import { dataCreditsContract } from "@helium/blockchain-api/contracts";
import { implement } from "@orpc/server";

export const dataCreditsRouter = implement(dataCreditsContract).router({
  mint,
  delegate,
});
