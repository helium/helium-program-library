import { approveProposal } from "./procedures/approve";
import { rejectProposal } from "./procedures/reject";
import { cancelProposal } from "./procedures/cancel";
import { executeProposal } from "./procedures/execute";
import { proposeConfigChange } from "./procedures/proposeConfigChange";
import { squadsContract } from "@helium/blockchain-api/contracts";
import { implement } from "@orpc/server";

export const squadsRouter = implement(squadsContract).router({
  approveProposal,
  rejectProposal,
  cancelProposal,
  executeProposal,
  proposeConfigChange,
});
