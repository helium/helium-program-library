import {
  getAssociatedTokenAddress,
} from "@solana/spl-token";
import { PublicKey } from "@solana/web3.js";
import { useAsync } from "react-async-hook";

interface AssocState {
  loading: boolean;
  result?: PublicKey;
}
const fetch = async (
  wallet: PublicKey | undefined | null,
  mint: PublicKey | undefined | null
): Promise<PublicKey | undefined> => {
  if (!wallet || !mint) {
    return undefined;
  }

  return getAssociatedTokenAddress(
    mint,
    wallet,
    true
  );
};

export function useAssociatedTokenAddress(
  wallet: PublicKey | undefined | null,
  mint: PublicKey | undefined | null
): AssocState {
  const { result, loading } = useAsync(fetch, [wallet, mint]);

  return { result, loading };
}
