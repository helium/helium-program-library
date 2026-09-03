import type { AnchorProvider, Idl, Program } from "@coral-xyz/anchor";
import { fetchBackwardsCompatibleIdl } from "@helium/spl-utils";
import type { PublicKey } from "@solana/web3.js";

/**
 * The shape every Helium SDK's `init` shares: an optional pre-fetched IDL that,
 * when supplied, skips the on-chain IDL read.
 */
type ProgramInit<T extends Idl> = (
  provider: AnchorProvider,
  programId?: PublicKey,
  idl?: Idl | null,
) => Promise<Program<T>>;

/**
 * Keyed by program id and holding the in-flight promise, so concurrent callers
 * share one read. A rejected fetch is evicted so the next request retries.
 */
const idlCache = new Map<string, Promise<Idl>>();

/**
 * An IDL only changes when the program is upgraded, so it is read once per
 * process rather than once per request. Every request that builds a program
 * through `initCachedProgram` otherwise pays one IDL read per program.
 *
 * The tradeoff: a program upgrade is not picked up until the process restarts.
 */
async function fetchCachedIdl(
  programId: PublicKey,
  provider: AnchorProvider,
): Promise<Idl> {
  const key = programId.toBase58();
  const cached = idlCache.get(key);
  if (cached) {
    return cached;
  }

  const pending = fetchBackwardsCompatibleIdl(programId, provider).then(
    (idl) => {
      if (!idl) {
        throw new Error(`No IDL found for program ${key}`);
      }
      return idl as Idl;
    },
  );
  idlCache.set(key, pending);
  pending.catch(() => idlCache.delete(key));

  return pending;
}

/**
 * Builds a program against the caller's provider — the provider carries the
 * request's wallet, which Anchor uses to default signer accounts, so the
 * `Program` itself must not be shared between requests. Only the IDL is.
 */
export async function initCachedProgram<T extends Idl>(
  init: ProgramInit<T>,
  programId: PublicKey,
  provider: AnchorProvider,
): Promise<Program<T>> {
  return init(provider, programId, await fetchCachedIdl(programId, provider));
}
