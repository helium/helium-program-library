/**
 * Input fields whose values may be written to the log. Everything else is
 * reduced to its key, so the log still shows an input's shape without showing
 * what is in it.
 *
 * An allowlist rather than a list of fields to hide: a schema that gains a
 * field gains it unlisted, and an unlisted field's value is not logged. Naming
 * the fields to withhold instead would make every new secret loggable until
 * somebody remembered to add it -- and `fiat.createBankAccount` alone carries
 * an account number, a routing number, a name and a home address.
 */
const LOGGABLE_INPUT_FIELDS = new Set([
  "cluster",
  "deviceType",
  "entityPubKey",
  "hotspotPubkey",
  "mint",
  "owner",
  "packAddress",
  "parallel",
  "signerWalletAddress",
  "simulate",
  "tag",
  "type",
  "userAddress",
  "userPublicKey",
  "walletAddress",
]);

/**
 * A value simple enough to log whole. A listed field that turns into an object
 * or an array stops having its value logged, so nesting a secret under a name
 * that was safe when it held a string does not start logging it.
 */
function isLoggableValue(value: unknown): boolean {
  return (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  );
}

/**
 * A one-line rendering of a procedure's input for the request log: every key,
 * and the value of each key that is on the allowlist. Empty for an input with
 * nothing in it, so a procedure that takes no arguments logs no braces.
 */
export function summarizeProcedureInput(input: unknown): string {
  if (input === null || typeof input !== "object") {
    return "";
  }

  const fields = Object.entries(input as Record<string, unknown>).map(
    ([key, value]) =>
      LOGGABLE_INPUT_FIELDS.has(key) && isLoggableValue(value)
        ? `${key}=${JSON.stringify(value)}`
        : key
  );
  if (fields.length === 0) {
    return "";
  }

  return ` {${fields.join(", ")}}`;
}
