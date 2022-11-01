import { LazyDistributor } from "@helium/idls/lib/types/lazy_distributor";
import { IDL } from "@helium/idls/lib/esm/lazy_distributor";
import { useIdlAccount, UseAccountState } from "@helium/helium-react-hooks";
import { Idl, IdlAccounts } from "@project-serum/anchor";
import { PublicKey } from "@solana/web3.js";

export type Recipient = IdlAccounts<LazyDistributor>["recipientV0"] & {
  pubkey: PublicKey;
}
const type = "recipientV0"
export function useRecipient(key: PublicKey): UseAccountState<Recipient> {
  // @ts-ignore
  return useIdlAccount<LazyDistributor>(key, IDL as LazyDistributor, type);
}
