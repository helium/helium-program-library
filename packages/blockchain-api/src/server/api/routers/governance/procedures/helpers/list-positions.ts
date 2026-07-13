import { init as initVsr, positionKey } from "@helium/voter-stake-registry-sdk";
import { getMint, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { Connection, PublicKey } from "@solana/web3.js";

type VsrProgram = Awaited<ReturnType<typeof initVsr>>;

export interface OwnedPosition {
  mint: PublicKey;
  position: PublicKey;
}

/**
 * Enumerate every VSR governance position owned by a wallet, registrar-agnostic.
 * Positions are supply-1, decimals-0 frozen NFTs whose mint freeze authority is
 * owned by the VSR program.
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

  const positions: OwnedPosition[] = [];
  for (const { account } of tokenAccounts.value) {
    if (account.data.parsed.info.tokenAmount.amount !== "1") continue;

    const mint = new PublicKey(account.data.parsed.info.mint);
    const freezeAuthority = (await getMint(connection, mint)).freezeAuthority;
    if (!freezeAuthority) continue;

    const freezeAuthorityOwner = (
      await connection.getAccountInfo(freezeAuthority)
    )?.owner;
    if (
      !freezeAuthorityOwner ||
      !freezeAuthorityOwner.equals(vsrProgram.programId)
    ) {
      continue;
    }

    positions.push({ mint, position: positionKey(mint)[0] });
  }

  return positions;
};
