import { PublicKey } from "@solana/web3.js";

export const getWritableAccountKeys = (
  accountKeys: PublicKey[] | Uint8Array[],
  header: {
    numRequiredSignatures: number;
    numReadonlySignedAccounts: number;
    numReadonlyUnsignedAccounts: number;
  }
): PublicKey[] => {
  // Calculate the range of account keys to slice
  const sliceEnd = accountKeys.length - header.numReadonlyUnsignedAccounts;

  // Get the account keys excluding readonly unsigned accounts
  const signableAccountKeys = accountKeys.slice(0, sliceEnd);

  // Filter out the readonly signed accounts
  const filteredKeys = signableAccountKeys.filter((_, index) => {
    const withinRequiredSignatures = index < header.numRequiredSignatures;
    const isSigner =
      index < header.numRequiredSignatures - header.numReadonlySignedAccounts;
    return isSigner || !withinRequiredSignatures;
  });

  // Map the remaining keys to PublicKey objects
  return filteredKeys.map((k) => new PublicKey(k));
};
