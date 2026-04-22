import { oc } from "@orpc/contract";
import { BAD_REQUEST, NOT_FOUND, UNAUTHORIZED } from "../errors/common";
import { INSUFFICIENT_FUNDS } from "../errors/solana";
import {
  AssignProxiesInputSchema,
  AssignProxiesResponseSchema,
  ClaimDelegationRewardsInputSchema,
  ClaimDelegationRewardsResponseSchema,
  ClosePositionInputSchema,
  ClosePositionResponseSchema,
  CreatePositionInputSchema,
  CreatePositionResponseSchema,
  DataBurnResponseSchema,
  DelegatePositionInputSchema,
  DelegatePositionsResponseSchema,
  ExtendDelegationInputSchema,
  ExtendDelegationResponseSchema,
  ExtendPositionInputSchema,
  ExtendPositionResponseSchema,
  FlipLockupKindInputSchema,
  FlipLockupKindResponseSchema,
  GetProposalVotesInputSchema,
  GetProposalVotesResponseSchema,
  GetProxiesInputSchema,
  GetProxiesResponseSchema,
  GetProxyAssignmentsInputSchema,
  GetProxyAssignmentsResponseSchema,
  GetProxyInputSchema,
  GetProxyRegistrarsInputSchema,
  GetProxyRegistrarsResponseSchema,
  GetProxyResponseSchema,
  GetVotesByWalletInputSchema,
  GetVotesByWalletResponseSchema,
  ProxyVoteInputSchema,
  ProxyVoteResponseSchema,
  RelinquishPositionVotesInputSchema,
  RelinquishPositionVotesResponseSchema,
  RelinquishVoteInputSchema,
  RelinquishVoteResponseSchema,
  ResetLockupInputSchema,
  ResetLockupResponseSchema,
  SplitPositionInputSchema,
  SplitPositionResponseSchema,
  SubdaoDelegationsResponseSchema,
  TransferPositionInputSchema,
  TransferPositionResponseSchema,
  TransferPositionOwnershipInputSchema,
  TransferPositionOwnershipResponseSchema,
  UnassignProxiesInputSchema,
  UnassignProxiesResponseSchema,
  UndelegateInputSchema,
  UndelegatePositionResponseSchema,
  VoteInputSchema,
  VoteResponseSchema,
} from "../schemas/governance";

export const governanceContract = oc
  .tag("Governance")
  .prefix("/governance")
  .router({
    createPosition: oc
      .route({
        method: "POST",
        path: "/positions",
        summary: "Create staking position",
        description:
          "Create a new staking position with specified lockup parameters. Optionally delegate to a sub-DAO immediately.",
      })
      .input(CreatePositionInputSchema)
      .errors({ BAD_REQUEST, INSUFFICIENT_FUNDS })
      .output(CreatePositionResponseSchema),

    closePosition: oc
      .route({
        method: "POST",
        path: "/positions/{positionMint}/close",
        summary: "Close staking position",
        description:
          "Close an expired staking position and withdraw all deposited tokens. Position must have no active votes and lockup must be expired.",
      })
      .input(ClosePositionInputSchema)
      .errors({ BAD_REQUEST, NOT_FOUND, UNAUTHORIZED, INSUFFICIENT_FUNDS })
      .output(ClosePositionResponseSchema),

    extendPosition: oc
      .route({
        method: "POST",
        path: "/positions/{positionMint}/extend",
        summary: "Extend position lockup",
        description:
          "Extend the lockup period of an existing staking position.",
      })
      .input(ExtendPositionInputSchema)
      .errors({ BAD_REQUEST, NOT_FOUND, INSUFFICIENT_FUNDS })
      .output(ExtendPositionResponseSchema),

    flipLockupKind: oc
      .route({
        method: "POST",
        path: "/positions/{positionMint}/flip-lockup",
        summary: "Flip lockup kind",
        description:
          "Switch position lockup between cliff and constant. Cliff unlocks at a specific time, constant never decays.",
      })
      .input(FlipLockupKindInputSchema)
      .errors({ BAD_REQUEST, NOT_FOUND, INSUFFICIENT_FUNDS })
      .output(FlipLockupKindResponseSchema),

    resetLockup: oc
      .route({
        method: "POST",
        path: "/positions/{positionMint}/reset-lockup",
        summary: "Reset position lockup",
        description:
          "Reset both lockup kind and period for a position. Allows changing cliff/constant and duration in one transaction.",
      })
      .input(ResetLockupInputSchema)
      .errors({ BAD_REQUEST, NOT_FOUND, INSUFFICIENT_FUNDS })
      .output(ResetLockupResponseSchema),

    splitPosition: oc
      .route({
        method: "POST",
        path: "/positions/{positionMint}/split",
        summary: "Split position",
        description:
          "Split tokens from an existing position into a new position with its own lockup parameters.",
      })
      .input(SplitPositionInputSchema)
      .errors({ BAD_REQUEST, NOT_FOUND, INSUFFICIENT_FUNDS })
      .output(SplitPositionResponseSchema),

    transferPosition: oc
      .route({
        method: "POST",
        path: "/positions/{positionMint}/transfer",
        summary: "Transfer between positions",
        description:
          "Transfer tokens from one position to another. Both positions must have no active votes.",
      })
      .input(TransferPositionInputSchema)
      .errors({ BAD_REQUEST, NOT_FOUND, INSUFFICIENT_FUNDS })
      .output(TransferPositionResponseSchema),

    transferPositionOwnership: oc
      .route({
        method: "POST",
        path: "/positions/{positionMint}/transfer-ownership",
        summary: "Transfer position ownership",
        description:
          "Transfer ownership of a position NFT to another wallet. Both the current owner and new owner must sign the transaction.",
      })
      .input(TransferPositionOwnershipInputSchema)
      .errors({ BAD_REQUEST, NOT_FOUND, INSUFFICIENT_FUNDS })
      .output(TransferPositionOwnershipResponseSchema),

    delegatePositions: oc
      .route({
        method: "POST",
        path: "/positions/delegate/{subDaoMint}",
        summary: "Delegate positions",
        description:
          "Delegate one or more positions to a sub-DAO. When changing delegation (already delegated to a different sub-DAO), automatically claims pending rewards first. If many epochs need claiming, may require multiple API calls - check hasMore in the response. Automatically handles expired delegations (claim, close, re-delegate) and renewable delegations (extend expiration). Optionally enable/disable automation for reward claiming. Safe to call repeatedly with the same positions. Supports proxy voting — positions proxied to the caller are auto-detected.",
      })
      .input(DelegatePositionInputSchema)
      .errors({ BAD_REQUEST, NOT_FOUND, INSUFFICIENT_FUNDS })
      .output(DelegatePositionsResponseSchema),

    claimDelegationRewards: oc
      .route({
        method: "POST",
        path: "/positions/claim-rewards",
        summary: "Claim delegation rewards",
        description:
          "Claim delegation rewards for one or more positions. May produce multiple transactions if rewards span many epochs. If many epochs need claiming, may require multiple API calls - check hasMore in the response. Safe to call repeatedly with the same positions - returns empty transactions when nothing left to claim.",
      })
      .input(ClaimDelegationRewardsInputSchema)
      .errors({ BAD_REQUEST, NOT_FOUND, INSUFFICIENT_FUNDS })
      .output(ClaimDelegationRewardsResponseSchema),

    undelegatePosition: oc
      .route({
        method: "POST",
        path: "/positions/{positionMint}/undelegate",
        summary: "Undelegate position",
        description:
          "Remove delegation from a position. Automatically claims any pending rewards before undelegating. If many epochs need claiming, may require multiple API calls - check hasMore in the response. Submit the returned transactions, then call again to get remaining claims or the final undelegate transaction.",
      })
      .input(UndelegateInputSchema)
      .errors({ BAD_REQUEST, NOT_FOUND, INSUFFICIENT_FUNDS })
      .output(UndelegatePositionResponseSchema),

    extendDelegation: oc
      .route({
        method: "POST",
        path: "/positions/{positionMint}/delegation/extend",
        summary: "Extend delegation",
        description:
          "Extend the expiration of a delegated position to the current season end.",
      })
      .input(ExtendDelegationInputSchema)
      .errors({ BAD_REQUEST, NOT_FOUND, INSUFFICIENT_FUNDS })
      .output(ExtendDelegationResponseSchema),

    vote: oc
      .route({
        method: "POST",
        path: "/proposals/{proposalKey}/vote",
        summary: "Vote on proposal",
        description:
          "Cast votes on a proposal using one or more positions. Auto-detects owned vs proxied positions — proxied positions use proxy vote path. Automatically queues cleanup tasks to relinquish vote markers after the proposal ends. If many positions are provided, may require multiple API calls - check hasMore in the response.",
      })
      .input(VoteInputSchema)
      .errors({ BAD_REQUEST, NOT_FOUND, INSUFFICIENT_FUNDS })
      .output(VoteResponseSchema),

    relinquishVote: oc
      .route({
        method: "POST",
        path: "/proposals/{proposalKey}/relinquish-votes",
        summary: "Relinquish vote",
        description:
          "Remove votes from a specific choice on a proposal for one or more positions. Auto-detects owned vs proxied positions — proxied positions use proxy relinquish path. If many positions are provided, may require multiple API calls - check hasMore in the response.",
      })
      .input(RelinquishVoteInputSchema)
      .errors({ BAD_REQUEST, NOT_FOUND, INSUFFICIENT_FUNDS })
      .output(RelinquishVoteResponseSchema),

    relinquishPositionVotes: oc
      .route({
        method: "POST",
        path: "/positions/{positionMint}/relinquish-vote",
        summary: "Relinquish all position votes",
        description:
          "Remove ALL active votes from a single position across all proposals in an organization. If many votes exist, may require multiple API calls - check hasMore in the response.",
      })
      .input(RelinquishPositionVotesInputSchema)
      .errors({ BAD_REQUEST, NOT_FOUND, INSUFFICIENT_FUNDS })
      .output(RelinquishPositionVotesResponseSchema),

    assignProxies: oc
      .route({
        method: "POST",
        path: "/proxy/{proxyKey}/assign",
        summary: "Assign voting proxy",
        description:
          "Delegate voting power to a proxy recipient for one or more positions. The proxy can vote on your behalf until the expiration time. If the recipient has already voted on open proposals, automatically propagates those votes to delegated positions via countProxyVoteV0. If many positions are provided, may require multiple API calls - check hasMore in the response.",
      })
      .input(AssignProxiesInputSchema)
      .errors({ BAD_REQUEST, NOT_FOUND, INSUFFICIENT_FUNDS })
      .output(AssignProxiesResponseSchema),

    unassignProxies: oc
      .route({
        method: "POST",
        path: "/proxy/{proxyKey}/unassign",
        summary: "Unassign voting proxy",
        description:
          "Remove voting proxy delegation from one or more positions, returning voting power to the owner. If many positions are provided, may require multiple API calls - check hasMore in the response.",
      })
      .input(UnassignProxiesInputSchema)
      .errors({ BAD_REQUEST, NOT_FOUND, INSUFFICIENT_FUNDS })
      .output(UnassignProxiesResponseSchema),

    getDataBurn: oc
      .route({
        method: "GET",
        path: "/data-burn",
        summary: "Get DC burned per subdao",
        description:
          "Returns data credits burned per subdao over the last 24h from Dune Analytics. Cached for one day.",
      })
      .output(DataBurnResponseSchema),

    getSubdaoDelegations: oc
      .route({
        method: "GET",
        path: "/subdao-delegations",
        summary: "Get total veTokens delegated per subdao",
        description:
          "Returns total veTokens currently delegated to each subdao. Values are BN strings. Cached for one day.",
      })
      .output(SubdaoDelegationsResponseSchema),

    getProxyAssignments: oc
      .route({
        method: "GET",
        path: "/registrars/{registrar}/proxy-assignments",
        summary: "List proxy assignments",
        description:
          "Returns proxy assignments for a registrar with optional filters on voter/position/index.",
      })
      .input(GetProxyAssignmentsInputSchema)
      .errors({ BAD_REQUEST, NOT_FOUND })
      .output(GetProxyAssignmentsResponseSchema),

    getProxies: oc
      .route({
        method: "GET",
        path: "/registrars/{registrar}/proxies",
        summary: "List proxies for a registrar",
        description:
          "Returns proxies for a registrar with aggregated vote statistics and veToken delegations. Cached for 10 minutes.",
      })
      .input(GetProxiesInputSchema)
      .errors({ BAD_REQUEST, NOT_FOUND })
      .output(GetProxiesResponseSchema),

    getProxy: oc
      .route({
        method: "GET",
        path: "/registrars/{registrar}/proxies/{wallet}",
        summary: "Get single proxy details",
        description:
          "Returns details for a single proxy including rank within the registrar and aggregated vote statistics.",
      })
      .input(GetProxyInputSchema)
      .errors({ BAD_REQUEST, NOT_FOUND })
      .output(GetProxyResponseSchema),

    getProxyRegistrars: oc
      .route({
        method: "GET",
        path: "/proxies/{wallet}/registrars",
        summary: "List registrars for a proxy wallet",
        description:
          "Returns the registrar addresses this proxy wallet is registered for.",
      })
      .input(GetProxyRegistrarsInputSchema)
      .errors({ BAD_REQUEST, NOT_FOUND })
      .output(GetProxyRegistrarsResponseSchema),

    getVotesByWallet: oc
      .route({
        method: "GET",
        path: "/registrars/{registrar}/votes/{wallet}",
        summary: "List proposals with a wallet's votes",
        description:
          "Returns proposals in the registrar's organization, each annotated with the wallet's votes (if any).",
      })
      .input(GetVotesByWalletInputSchema)
      .errors({ BAD_REQUEST, NOT_FOUND })
      .output(GetVotesByWalletResponseSchema),

    getProposalVotes: oc
      .route({
        method: "GET",
        path: "/proposals/{proposalKey}/votes",
        summary: "List votes for a proposal",
        description:
          "Returns every vote marker for the proposal, expanded per choice, joined with proxy names.",
      })
      .input(GetProposalVotesInputSchema)
      .errors({ BAD_REQUEST, NOT_FOUND })
      .output(GetProposalVotesResponseSchema),

    proxyVote: oc
      .route({
        method: "POST",
        path: "/proposals/{proposalKey}/proxy-vote/{wallet}",
        summary: "Build + sign proxy-vote crank transaction",
        description:
          "Builds the next proxy-vote crank transaction for the given wallet and proposal. Returns a base64 RemoteTaskTransactionV0 with an ed25519 signature from the service keypair. Returns 503 if the indexer has not yet caught up.",
      })
      .input(ProxyVoteInputSchema)
      .errors({ BAD_REQUEST, NOT_FOUND })
      .output(ProxyVoteResponseSchema),
  });
