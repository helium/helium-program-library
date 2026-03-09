"use client";

import { useWalletAddress } from "@/hooks/useWalletAddress";
import { useMemo } from "react";

export const useIsOwner = (walletAddress: string) => {
  const effectiveAddress = useWalletAddress();

  return useMemo(() => {
    if (!effectiveAddress || !walletAddress) return false;
    return effectiveAddress.toLowerCase() === walletAddress.toLowerCase();
  }, [effectiveAddress, walletAddress]);
};
