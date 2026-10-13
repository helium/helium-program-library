/**
 * Whether the transactions of a delegate request can land in any order.
 *
 * `start_delegation_claim_bot_v1` reads `delegated_position` and binds it to the
 * sub-DAO it is given, and the route gives it the target sub-DAO. `delegateV0`
 * creates that account and `changeDelegationV0` moves it to the target sub-DAO,
 * so the start of a position must land after its delegate or its change.
 */
export const delegationSubmitsInParallel = ({
  hasClaimTransactions,
  positions,
}: {
  hasClaimTransactions: boolean;
  positions: {
    delegation: "delegate" | "change" | "extend" | null;
    /** The task id reserved for the start of the claim bot, or null with no start. */
    taskId: number | null;
  }[];
}): boolean =>
  !hasClaimTransactions &&
  !positions.some(
    (position) =>
      (position.delegation === "delegate" ||
        position.delegation === "change") &&
      position.taskId !== null,
  );
