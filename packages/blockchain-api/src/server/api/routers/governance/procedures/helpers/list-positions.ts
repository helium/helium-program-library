import { init as initVsr, positionKey } from "@helium/voter-stake-registry-sdk";
import { chunks } from "@helium/spl-utils";
import { TOKEN_PROGRAM_ID, unpackMint } from "@solana/spl-token";
import { Connection, PublicKey } from "@solana/web3.js";

type VsrProgram = Awaited<ReturnType<typeof initVsr>>;
type PositionV0 = Awaited<
  ReturnType<VsrProgram["account"]["positionV0"]["fetch"]>
>;
type Registrar = Awaited<
  ReturnType<VsrProgram["account"]["registrar"]["fetch"]>
>;

export interface OwnedPosition {
  mint: PublicKey;
  position: PublicKey;
  account: PositionV0;
}

/**
 * Dedupe the registrars referenced by a set of positions and fetch each once,
 * returning a Map keyed by the registrar's base58 address.
 */
export const fetchRegistrarsByKey = async (
  vsrProgram: VsrProgram,
  positions: OwnedPosition[]
): Promise<Map<string, Registrar | null>> => {
  const keys = [
    ...new Set(positions.map((p) => p.account.registrar.toBase58())),
  ];
  const registrars = await vsrProgram.account.registrar.fetchMultiple(
    keys.map((k) => new PublicKey(k))
  );
  return new Map(keys.map((k, i) => [k, registrars[i]]));
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

  // getMultipleAccounts is capped at 100 keys per RPC call.
  const mintInfos = (
    await Promise.all(
      chunks(candidateMints, 100).map((c) =>
        connection.getMultipleAccountsInfo(c)
      )
    )
  ).flat();
  // The on-chain invariant (transfer_position_v0's mint constraint) is
  // mint::freeze_authority = position PDA. Requiring the exact PDA — not just
  // any VSR-owned freeze authority — keeps permissionlessly dusted fake
  // "position" NFTs out of the enumeration; anyone can point a mint's freeze
  // authority at an existing VSR account, but only the real position mint's
  // PDA can be an initialized VSR account.
  const candidates: { mint: PublicKey; position: PublicKey }[] = [];
  mintInfos.forEach((info, i) => {
    if (!info) return;
    const { freezeAuthority } = unpackMint(candidateMints[i], info);
    const position = positionKey(candidateMints[i])[0];
    if (freezeAuthority?.equals(position)) {
      candidates.push({ mint: candidateMints[i], position });
    }
  });
  if (candidates.length === 0) return [];

  const positionInfos = (
    await Promise.all(
      chunks(
        candidates.map((c) => c.position),
        100
      ).map((c) => connection.getMultipleAccountsInfo(c))
    )
  ).flat();

  // Existence of a VSR-owned account at the position PDA proves PositionV0 is
  // initialized, so downstream transferPositionV0 builds can't hit 3012. Decode
  // it here so callers don't re-fetch the same accounts.
  return candidates.flatMap((c, i) => {
    const info = positionInfos[i];
    if (!info?.owner.equals(vsrProgram.programId)) return [];
    return [
      {
        ...c,
        account: vsrProgram.coder.accounts.decode<PositionV0>(
          "positionV0",
          info.data
        ),
      },
    ];
  });
};
