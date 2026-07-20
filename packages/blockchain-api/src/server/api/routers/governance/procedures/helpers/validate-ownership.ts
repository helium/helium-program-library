import { AccountInfo, Connection, PublicKey } from "@solana/web3.js";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";

export interface OwnershipValidationResult {
  isOwner: boolean;
  tokenAccount: PublicKey;
}

type OwnershipErrorHandler = {
  UNAUTHORIZED?: (opts: { message: string }) => unknown;
  BAD_REQUEST?: (opts: { message: string }) => unknown;
};

function throwOwnershipError(
  errors: OwnershipErrorHandler,
  message: string,
): never {
  if (errors.UNAUTHORIZED) {
    throw errors.UNAUTHORIZED({ message });
  }
  if (errors.BAD_REQUEST) {
    throw errors.BAD_REQUEST({ message });
  }
  throw new Error(message);
}

export async function validatePositionOwnership(
  connection: Connection,
  positionMint: PublicKey,
  wallet: PublicKey,
): Promise<OwnershipValidationResult> {
  const tokenAccount = getAssociatedTokenAddressSync(
    positionMint,
    wallet,
    true,
  );
  const tokenAccountInfo = await connection.getAccountInfo(tokenAccount);
  return {
    isOwner: tokenAccountInfo !== null,
    tokenAccount,
  };
}

/**
 * Batched ownership check for many positions at once.
 *
 * Equivalent to calling {@link validatePositionOwnership} per mint, but issues
 * one `getMultipleAccounts` per 100 ATAs instead of one `getAccountInfo` per
 * position. For a wallet voting a large proxied set this turns N sequential
 * round-trips into ceil(N/100) batched ones. Returns `isOwner` aligned by index
 * with `positionMints`.
 */
export async function validatePositionOwnershipBatch(
  connection: Connection,
  positionMints: PublicKey[],
  wallet: PublicKey,
): Promise<boolean[]> {
  const tokenAccounts = positionMints.map((mint) =>
    getAssociatedTokenAddressSync(mint, wallet, true),
  );

  const CHUNK_SIZE = 100;
  const infos: (AccountInfo<Buffer> | null)[] = [];
  for (let i = 0; i < tokenAccounts.length; i += CHUNK_SIZE) {
    const chunk = tokenAccounts.slice(i, i + CHUNK_SIZE);
    infos.push(...(await connection.getMultipleAccountsInfo(chunk)));
  }

  return infos.map((info) => info !== null);
}

export async function requirePositionOwnership<T extends OwnershipErrorHandler>(
  connection: Connection,
  positionMint: PublicKey,
  wallet: PublicKey,
  errors: T,
): Promise<PublicKey> {
  const { isOwner, tokenAccount } = await validatePositionOwnership(
    connection,
    positionMint,
    wallet,
  );
  if (!isOwner) {
    throwOwnershipError(errors, "Wallet does not own the specified position");
  }
  return tokenAccount;
}

export async function requirePositionOwnershipWithMessage<
  T extends OwnershipErrorHandler,
>(
  connection: Connection,
  positionMint: PublicKey,
  wallet: PublicKey,
  positionIdentifier: string,
  errors: T,
): Promise<PublicKey> {
  const { isOwner, tokenAccount } = await validatePositionOwnership(
    connection,
    positionMint,
    wallet,
  );
  if (!isOwner) {
    throwOwnershipError(
      errors,
      `Wallet does not own position ${positionIdentifier}`,
    );
  }
  return tokenAccount;
}
