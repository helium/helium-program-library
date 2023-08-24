import { Idl } from "@coral-xyz/anchor";
import { decodeIdlAccount } from "@coral-xyz/anchor/dist/cjs/idl";
import { utf8 } from "@coral-xyz/anchor/dist/cjs/utils/bytes";
import { TypedAccountParser } from "@helium/account-fetch-cache";
import { UseAccountState, useAccount } from "@helium/account-fetch-cache-hooks";
import { sha256 } from "@noble/hashes/sha256";
import { PublicKey } from "@solana/web3.js";
import { inflate } from "pako";
import { useMemo, useState } from "react";

export function useIdl<IDL extends Idl>(
  programId: PublicKey | undefined
): UseAccountState<IDL> & { error: Error | undefined } {
  const [idlError, setIdlError] = useState<Error | undefined>();
  const idlKey = useMemo(() => {
    if (programId) {
      const base = PublicKey.findProgramAddressSync([], programId)[0];
      const buffer = Buffer.concat([
        base.toBuffer(),
        Buffer.from("anchor:idl"),
        programId.toBuffer(),
      ]);
      const publicKeyBytes = sha256(buffer);
      return new PublicKey(publicKeyBytes);
    }
  }, [programId?.toBase58()]);
  const idlParser: TypedAccountParser<IDL> = useMemo(() => {
    return (_, data) => {
      try {
        const idlData = decodeIdlAccount(Buffer.from(data.data.subarray(8)));
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
    loading: result.loading,
    error: idlError,
  };
}
