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
 * authority is an account owned by the VSR program (the position PDA).
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
  const withFreezeAuthority: { mint: PublicKey; freezeAuthority: PublicKey }[] =
    [];
  mintInfos.forEach((info, i) => {
    if (!info) return;
    const { freezeAuthority } = unpackMint(candidateMints[i], info);
    if (freezeAuthority) {
      withFreezeAuthority.push({ mint: candidateMints[i], freezeAuthority });
    }
  });
  if (withFreezeAuthority.length === 0) return [];

  const freezeAuthorityInfos = await getMultipleAccountsChunked(
    connection,
    withFreezeAuthority.map((w) => w.freezeAuthority)
  );

  const positions: OwnedPosition[] = [];
  freezeAuthorityInfos.forEach((info, i) => {
    if (info?.owner.equals(vsrProgram.programId)) {
      const { mint } = withFreezeAuthority[i];
      positions.push({ mint, position: positionKey(mint)[0] });
    }
  });

  return positions;
};
