import { Idl } from "@coral-xyz/anchor";
import { decodeIdlAccount, idlAddress } from "@coral-xyz/anchor/dist/cjs/idl";
import { TypedAccountParser } from "@helium/account-fetch-cache";
import { UseAccountState, useAccount } from "@helium/account-fetch-cache-hooks";
import { PublicKey } from "@solana/web3.js";
import { useMemo, useState } from "react";
import { useAsync } from "react-async-hook";
import { inflate } from "pako";
import { utf8 } from "@coral-xyz/anchor/dist/cjs/utils/bytes";

export function useIdl<IDL extends Idl>(programId: PublicKey | undefined): UseAccountState<IDL> & { error: Error | undefined } {
  const [idlError, setIdlError] = useState<Error | undefined>();
  const { result: idlKey, error } = useAsync(
    (owner: string | undefined) => owner && idlAddress(new PublicKey(owner)),
    [programId?.toBase58()]
  );
  const idlParser: TypedAccountParser<IDL> = useMemo(() => {
    return (_, data) => {
      try {
        const idlData = decodeIdlAccount(data.data.subarray(8));
        const inflatedIdl = inflate(idlData.data);
        return JSON.parse(utf8.decode(inflatedIdl));
      } catch (e: any) {
        console.error(e);
        setIdlError(e);
      }
    };
  }, []);

  const result = useAccount(idlKey, idlParser);
  return {
    ...result,
    error: idlError || error
  }
}
