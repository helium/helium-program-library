import { Idl } from "@coral-xyz/anchor";
import { decodeIdlAccount } from "@coral-xyz/anchor/dist/cjs/idl";
import { utf8 } from "@coral-xyz/anchor/dist/cjs/utils/bytes";
import { TypedAccountParser } from "@helium/account-fetch-cache";
import {
  UseAccountState,
  useAccount,
  useAccountFetchCache,
} from "@helium/account-fetch-cache-hooks";
import { sha256 } from "@noble/hashes/sha256";
import { Connection, PublicKey } from "@solana/web3.js";
import { inflate } from "pako";
import { useMemo, useState } from "react";

const parserCache = new Map<string, TypedAccountParser<any>>();

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
  const cache = useAccountFetchCache();
  const idlParser: TypedAccountParser<IDL> = useMemo(() => {
    if (programId) {
      const cacheK = cacheKey(programId, cache.connection)
      // Default to using the cached parser if it exists, this makes
      // for fewer rerenders in useAccounts.
      if (!parserCache[cacheK]) {
        parserCache[cacheK] = (_, data) => {
          try {
            const idlData = decodeIdlAccount(
              Buffer.from(data.data.subarray(8))
            );
            const inflatedIdl = inflate(idlData.data);
            return JSON.parse(utf8.decode(inflatedIdl));
          } catch (e: any) {
            if (cache.enableLogging) {
              console.error(e);
            }
            setIdlError(e);
          }
        };
      }

      return parserCache[cacheK];
    }
    return undefined;
  }, [programId, cache]);

  const result = useAccount(idlKey, idlParser);
  return {
    ...result,
    loading: result.loading,
    error: idlError,
  };
}

function cacheKey(programId: PublicKey, connection: Connection) {
  return `${programId.toBase58()}-${connection.rpcEndpoint}`
}