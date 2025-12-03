import * as anchor from "@coral-xyz/anchor";
import { fetchBackwardsCompatibleIdl } from "@helium/spl-utils";
import { PublicKey } from "@solana/web3.js";

const cachedIdlFetch = (() => {
  let cache: Map<string, anchor.Idl> = new Map();

  const fetchIdl = async ({
    programId,
    skipCache = false,
    provider,
  }: {
    programId: string;
    skipCache?: boolean;
    provider: anchor.AnchorProvider;
  }): Promise<anchor.Idl | null> => {
    let idl: anchor.Idl | null;

    if (!skipCache && cache.has(programId)) {
      idl = cache.get(programId)!;
      // Move the accessed item to the end to represent recent use
      cache.delete(programId);
      cache.set(programId, idl);
    } else {
      idl = await fetchBackwardsCompatibleIdl(
        new PublicKey(programId),
        provider
      );

      if (idl) {
        cache.set(programId, idl);
        // Prune cache to 10 items
        if (cache.size > 10) {
          const firstKey = cache.keys().next().value;
          cache.delete(firstKey!);
        }
      }
    }

    return idl;
  };

  return { fetchIdl };
})();

export default cachedIdlFetch;
