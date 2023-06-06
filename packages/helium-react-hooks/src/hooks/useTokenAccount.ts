import { useAccount, UseAccountState } from "@helium/account-fetch-cache-hooks";
import { Account, unpackAccount } from "@solana/spl-token";
import { AccountInfo, PublicKey } from "@solana/web3.js";

const parser = (
  pubkey: PublicKey,
  acct: AccountInfo<Buffer>
): Account | undefined => {
  return unpackAccount(pubkey, acct);
};

export function useTokenAccount(
  address: PublicKey | undefined | null
): UseAccountState<Account | undefined> {
  return useAccount(address, parser);
}
