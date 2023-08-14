import * as anchor from '@coral-xyz/anchor';

const cachedIdlFetch = (() => {
  let cache: { programId: string; idl: anchor.Idl }[] = [];

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
    const foundIdx = cache.findIndex(
      (cacheItem) => cacheItem.programId === programId
    );

    if (!skipCache && foundIdx > -1) {
      idl = cache[foundIdx].idl;
      // move to front of cache
      cache.splice(0, 0, cache.splice(foundIdx, 1)[0]);
    } else {
      idl = await anchor.Program.fetchIdl(programId, provider);

      if (idl) {
        cache.unshift({ programId, idl });
        // prune cache to 10 items;
        cache = cache.slice(0, 10);
      }
    }

    return idl;
  };

  return { fetchIdl };
})();

export default cachedIdlFetch;
