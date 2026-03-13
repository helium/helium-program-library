import { rewardContract } from "@helium/blockchain-api/contracts";
import { claim } from "./procedures/claim";
import { create } from "./procedures/create";
import { deleteMethod } from "./procedures/delete";
import { estimateCreationCost } from "./procedures/estimateCreationCost";
import { find } from "./procedures/find";
import { invite } from "./procedures/invite";
import { implement } from "@orpc/server";

export const rewardContractRouter = implement(rewardContract).router({
  find,
  estimateCreationCost,
  create,
  delete: deleteMethod,
  invite,
  claim,
});
