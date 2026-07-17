import { init as initVsr, positionKey } from "@helium/voter-stake-registry-sdk";
import { TOKEN_PROGRAM_ID, unpackMint } from "@solana/spl-token";
import { AccountInfo, Connection, PublicKey } from "@solana/web3.js";

type VsrProgram = Awaited<ReturnType<typeof initVsr>>;

export interface OwnedPosition {
  mint: PublicKey;
  position: PublicKey;
}

// getMultipleAccounts is capped at 100 keys per RPC call.
const MULTIPLE_ACCOUNTS_CHUNK = 100;

const getMultipleAccountsChunked = async (
  connection: Connection,
  keys: PublicKey[]
): Promise<(AccountInfo<Buffer> | null)[]> => {
  const infos: (AccountInfo<Buffer> | null)[] = [];
  for (let i = 0; i < keys.length; i += MULTIPLE_ACCOUNTS_CHUNK) {
    infos.push(
      ...(await connection.getMultipleAccountsInfo(
        keys.slice(i, i + MULTIPLE_ACCOUNTS_CHUNK)
      ))
    );
  }
  return infos;
};

/**
 * Enumerate every VSR governance position owned by a wallet, registrar-agnostic.
 * Positions are identified as amount-1 token accounts whose mint's freeze
 * authority is the position PDA for that mint AND that PDA is an initialized
 * account owned by the VSR program.
 */
export const getPositionsForOwner = async ({
  connection,
  vsrProgram,
  owner,
}: {
  connection: Connection;
  vsrProgram: VsrProgram;
  owner: PublicKey;
}): Promise<OwnedPosition[]> => {
  const tokenAccounts = await connection.getParsedTokenAccountsByOwner(owner, {
    programId: TOKEN_PROGRAM_ID,
  });

  const candidateMints = tokenAccounts.value
    .filter(
      ({ account }) => account.data.parsed.info.tokenAmount.amount === "1"
    )
    .map(({ account }) => new PublicKey(account.data.parsed.info.mint));
  if (candidateMints.length === 0) return [];

  const mintInfos = await getMultipleAccountsChunked(
    connection,
    candidateMints
  );
  // The on-chain invariant (transfer_position_v0's mint constraint) is
  // mint::freeze_authority = position PDA. Requiring the exact PDA — not just
  // any VSR-owned freeze authority — keeps permissionlessly dusted fake
  // "position" NFTs out of the enumeration; anyone can point a mint's freeze
  // authority at an existing VSR account, but only the real position mint's
  // PDA can be an initialized VSR account.
  const candidates: OwnedPosition[] = [];
  mintInfos.forEach((info, i) => {
    if (!info) return;
    const { freezeAuthority } = unpackMint(candidateMints[i], info);
    const position = positionKey(candidateMints[i])[0];
    if (freezeAuthority?.equals(position)) {
      candidates.push({ mint: candidateMints[i], position });
    }
  });
  if (candidates.length === 0) return [];

  const positionInfos = await getMultipleAccountsChunked(
    connection,
    candidates.map((c) => c.position)
  );

  // Existence of a VSR-owned account at the position PDA proves PositionV0 is
  // initialized, so downstream transferPositionV0 builds can't hit 3012.
  return candidates.filter((_, i) =>
    positionInfos[i]?.owner.equals(vsrProgram.programId)
  );
};
