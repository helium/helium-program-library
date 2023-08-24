import { useAccount } from "@helium/account-fetch-cache-hooks";
import { AccountInfo, PublicKey } from "@solana/web3.js";

const parser = (_: PublicKey, account: AccountInfo<Buffer>) => BigInt(account.lamports);
export function useSolOwnedAmount(ownerPublicKey?: PublicKey): {
  amount: bigint | undefined;
  loading: boolean;
} {
  const { info: lamports, loading } = useAccount<bigint>(
    ownerPublicKey,
    parser    
  );

  return {
    amount: lamports,
    loading,
  };
}
