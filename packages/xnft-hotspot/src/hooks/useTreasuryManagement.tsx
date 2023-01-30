import { UseAccountState, useIdlAccount } from "@helium/helium-react-hooks";
import { IDL } from "@helium/idls/lib/esm/treasury_management";
import { TreasuryManagement as TreasuryManagementType } from "@helium/idls/lib/types/treasury_management";
import { IdlAccounts } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";

export type TreasuryManagement =
  IdlAccounts<TreasuryManagementType>["treasuryManagementV0"] & {
    pubkey: PublicKey;
  };
const type = "treasuryManagementV0";
export function useTreasuryManagement(key: PublicKey): UseAccountState<TreasuryManagement> {
  // @ts-ignore
  return useIdlAccount<TreasuryManagementType>(
    key,
    IDL as TreasuryManagementType,
    type
  );
}
