/**
 * Classify a simulation failure into a category for Sentry fingerprinting.
 * Used by both individual tx simulation (submit.ts) and Jito bundle simulation (jito.ts).
 */
export function classifySimulationLogs(
  errorMessage: string,
  logs: (string | null)[] | null,
): { category: string; detail: string } {
  const logsStr = (logs ?? []).join("\n");
  const combined = `${errorMessage}\n${logsStr}`;

  if (
    errorMessage.includes("AccountNotFound") ||
    logsStr.includes("AccountNotFound")
  ) {
    return { category: "account_not_found", detail: "AccountNotFound" };
  }

  if (
    errorMessage.includes("InvalidAccountForFee") ||
    logsStr.includes("InvalidAccountForFee")
  ) {
    return {
      category: "invalid_account_for_fee",
      detail: "InvalidAccountForFee",
    };
  }

  if (
    combined.includes("insufficient lamports") ||
    combined.includes("insufficient funds")
  ) {
    const programMatch = combined.match(
      /Program (\S+) failed.*(?:insufficient|custom program error)/,
    );
    const program = programMatch?.[1] ?? "unknown";
    const amountMatch = combined.match(
      /insufficient lamports (\d+), need (\d+)/,
    );
    const detail = amountMatch
      ? `insufficient_lamports(have=${amountMatch[1]},need=${amountMatch[2]},program=${program})`
      : `insufficient_funds(program=${program})`;
    return { category: "insufficient_funds", detail };
  }

  if (combined.includes("BlockhashNotFound")) {
    return { category: "blockhash_not_found", detail: "BlockhashNotFound" };
  }

  if (combined.includes("already in use")) {
    return {
      category: "account_already_in_use",
      detail: "account already in use",
    };
  }

  // Extract Custom error codes (e.g. {"InstructionError":[4,{"Custom":6044}]})
  const customMatch = errorMessage.match(/Custom[":]+(\d+)/);
  if (customMatch) {
    const programMatch = logsStr.match(/Program (\S+) failed/);
    const program = programMatch?.[1] ?? "unknown";
    return {
      category: "custom_program_error",
      detail: `Custom(${customMatch[1]})(program=${program})`,
    };
  }

  return {
    category: "other",
    detail: errorMessage.slice(0, 100) || "unknown",
  };
}
