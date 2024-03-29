import { UseAccountState, useIdlAccount } from "@helium/helium-react-hooks";
import { IDL } from "@helium/idls/lib/esm/lazy_distributor";
import { LazyDistributor } from "@helium/idls/lib/types/lazy_distributor";
import { IdlAccounts } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";

export type Recipient = IdlAccounts<LazyDistributor>["recipientV0"] & {
  pubkey: PublicKey;
}
const type = "recipientV0"
export function useRecipient(key: PublicKey): UseAccountState<Recipient> {
  // @ts-ignore
  return useIdlAccount<LazyDistributor>(key, IDL as LazyDistributor, type);
}
