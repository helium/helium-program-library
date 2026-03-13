import { Connection, PublicKey } from "@solana/web3.js";
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
