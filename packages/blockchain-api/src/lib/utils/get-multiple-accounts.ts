import { chunks } from "@helium/spl-utils";
import type { Connection, PublicKey } from "@solana/web3.js";

// getMultipleAccounts caps out at 100 keys per call, so anything longer is
// split. The splits are independent reads, so they go out together: a claim
// spanning five batches of 128 epochs is 10 round trips, and awaiting them one
// at a time costs ten times a single round trip in request latency.
export async function getMultipleAccounts(
  connection: Connection,
  keys: PublicKey[],
): Promise<(Awaited<ReturnType<Connection["getAccountInfo"]>> | null)[]> {
  const batches = await Promise.all(
    chunks(keys, 100).map((batchKeys) =>
      connection.getMultipleAccountsInfo(batchKeys),
    ),
  );

  return batches.flat();
}
