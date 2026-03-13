import { PublicKey } from "@solana/web3.js";
import { recipientKey } from "@helium/lazy-distributor-sdk";
import { getMultipleAccounts } from "@helium/account-fetch-cache";
import type { Connection } from "@solana/web3.js";

// Types from @helium/lazy-distributor-sdk init() and @helium/mini-fanout-sdk init()
type LazyDistributorProgram = Awaited<
  ReturnType<typeof import("@helium/lazy-distributor-sdk").init>
>;
type MiniFanoutProgram = Awaited<
  ReturnType<typeof import("@helium/mini-fanout-sdk").init>
>;

interface FilterResult {
  claimable: Array<{ asset: PublicKey; entityKey: string }>;
  skippedCount: number;
}

/**
 * Filters out hotspots whose recipient.destination is a valid mini fanout account.
 * Hotspots with mini fanouts have their rewards distributed automatically.
 */
export async function filterHotspotsWithoutMiniFanout(
  ldProgram: LazyDistributorProgram,
  mfProgram: MiniFanoutProgram,
  connection: Connection,
  lazyDistributor: PublicKey,
  hotspots: Array<{ asset: PublicKey; entityKey: string }>,
): Promise<FilterResult> {
  if (hotspots.length === 0) {
    return { claimable: [], skippedCount: 0 };
  }

  // Batch fetch all recipient accounts
  const recipientKeys = hotspots.map(
    (h) => recipientKey(lazyDistributor, h.asset)[0],
  );
  const recipients =
    await ldProgram.account.recipientV0.fetchMultiple(recipientKeys);

  // Collect unique non-default destinations
  const destinationToIndices = new Map<string, number[]>();
  recipients.forEach((recipient, idx) => {
    if (!recipient) return;

    const destination = recipient.destination;
    if (!destination || destination.equals(PublicKey.default)) return;

    const destStr = destination.toBase58();
    const indices = destinationToIndices.get(destStr) || [];
    indices.push(idx);
    destinationToIndices.set(destStr, indices);
  });

  // If no custom destinations, all hotspots are claimable
  if (destinationToIndices.size === 0) {
    return { claimable: hotspots, skippedCount: 0 };
  }

  // Batch fetch destination accounts
  const uniqueDestinations = [...destinationToIndices.keys()];
  const destinationAccounts = (
    await getMultipleAccounts(connection, uniqueDestinations, "confirmed")
  ).array;

  // Determine which destinations are valid mini fanouts
  const validMiniFanoutDestinations = new Set<string>();
  destinationAccounts.forEach((accountInfo, idx) => {
    if (!accountInfo) return;

    try {
      mfProgram.coder.accounts.decode("miniFanoutV0", accountInfo.data);
      // Successfully decoded - it's a valid mini fanout
      validMiniFanoutDestinations.add(uniqueDestinations[idx]!);
    } catch {
      // Not a mini fanout account - ignore
    }
  });

  // Filter hotspots - exclude those with valid mini fanout destinations
  const claimable: Array<{ asset: PublicKey; entityKey: string }> = [];
  let skippedCount = 0;

  hotspots.forEach((hotspot, idx) => {
    const recipient = recipients[idx];
    if (!recipient) {
      // No recipient account yet - claimable (first claim creates it)
      claimable.push(hotspot);
      return;
    }

    const destination = recipient.destination;
    if (!destination || destination.equals(PublicKey.default)) {
      // Standard claim destination - claimable
      claimable.push(hotspot);
      return;
    }

    const destStr = destination.toBase58();
    if (validMiniFanoutDestinations.has(destStr)) {
      // Has a valid mini fanout - skip
      skippedCount++;
    } else {
      // Destination exists but not a mini fanout - claimable
      claimable.push(hotspot);
    }
  });

  return { claimable, skippedCount };
}
