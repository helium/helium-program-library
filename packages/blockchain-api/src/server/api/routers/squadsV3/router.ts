import { approveProposal } from "./procedures/approve";
import { rejectProposal } from "./procedures/reject";
import { cancelProposal } from "./procedures/cancel";
import { executeProposal } from "./procedures/execute";
import { proposeConfigChange } from "./procedures/proposeConfigChange";
import { squadsV3Contract } from "@helium/blockchain-api/contracts";
import { implement } from "@orpc/server";

export const squadsV3Router = implement(squadsV3Contract).router({
  approveProposal,
  rejectProposal,
  cancelProposal,
  executeProposal,
  proposeConfigChange,
});
