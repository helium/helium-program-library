"use client";

import { usePrivy } from "@privy-io/react-auth";
import { useViewAs } from "@/providers/ViewAsProvider";

/**
 * Returns the effective wallet address, respecting the ?viewAs= debug override.
 * When viewAs is set, this returns the impersonated address.
 * Otherwise returns the authenticated user's wallet address.
 */
export const useWalletAddress = (): string | null => {
  const { viewAsAddress } = useViewAs();
  const { user } = usePrivy();

  return viewAsAddress ?? user?.wallet?.address ?? null;
};
