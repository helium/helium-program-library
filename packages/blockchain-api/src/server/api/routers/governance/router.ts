import { governanceContract } from "@helium/blockchain-api/contracts";
import { implement } from "@orpc/server";
import { create as createPosition } from "./procedures/positions/create";
import { close as closePosition } from "./procedures/positions/close";
import { extend as extendPosition } from "./procedures/positions/extend";
import { flipLockupKind } from "./procedures/positions/flip-lockup-kind";
import { resetLockup } from "./procedures/positions/reset-lockup";
import { split as splitPosition } from "./procedures/positions/split";
import { transfer as transferPosition } from "./procedures/positions/transfer";
import { transferOwnership as transferPositionOwnership } from "./procedures/positions/transfer-ownership";
import { delegate } from "./procedures/delegation/delegate";
import { extend as extendDelegation } from "./procedures/delegation/extend";
import { undelegate } from "./procedures/delegation/undelegate";
import { claimRewards } from "./procedures/delegation/claim-rewards";
import { vote } from "./procedures/voting/vote";
import { relinquishVote } from "./procedures/voting/relinquish-vote";
import { relinquishPositionVotes } from "./procedures/voting/relinquish-position-votes";
import { assign as assignProxy } from "./procedures/proxy/assign";
import { unassign as unassignProxy } from "./procedures/proxy/unassign";

export const governanceRouter = implement(governanceContract).router({
  createPosition,
  closePosition,
  extendPosition,
  flipLockupKind,
  resetLockup,
  splitPosition,
  transferPosition,
  transferPositionOwnership,
  delegatePositions: delegate,
  claimDelegationRewards: claimRewards,
  undelegatePosition: undelegate,
  extendDelegation,
  vote,
  relinquishVote,
  relinquishPositionVotes,
  assignProxies: assignProxy,
  unassignProxies: unassignProxy,
});
