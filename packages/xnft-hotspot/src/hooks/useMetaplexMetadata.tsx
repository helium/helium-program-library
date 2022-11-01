import { useAccount, UseAccountState } from "@helium/helium-react-hooks";
import { TypedAccountParser } from "@helium/spl-utils";
import { PublicKey } from "@solana/web3.js";
import { useMemo } from "react";
import {
  PROGRAM_ID as MPL_PID,
  Metadata,
} from "@metaplex-foundation/mpl-token-metadata";

export function useMetaplexMetadata(mint: PublicKey): UseAccountState<Metadata> {
  const metadata = PublicKey.findProgramAddressSync(
    [
      Buffer.from("metadata", "utf-8"),
      MPL_PID.toBuffer(),
      mint.toBuffer(),
    ],
    MPL_PID
  )[0];
  const parser: TypedAccountParser<Metadata> = useMemo(() => {
    return (_, account) => {
      return Metadata.fromAccountInfo(account)[0];
    }
  }, [])
  return useAccount(metadata, parser)
}
