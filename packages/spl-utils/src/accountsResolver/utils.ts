import { PublicKey } from "@solana/web3.js";

export type Accounts = { [name: string]: PublicKey | Accounts };

export function set(
  accounts: Accounts,
  path: string[],
  value: PublicKey | undefined
): Accounts {
  if (!value) {
    return accounts;
  }

  let curr = accounts;
  path.forEach((p, idx) => {
    const isLast = idx == path.length - 1;
    if (isLast) {
      curr[p] = value;
    }

    curr[p] = curr[p] || {};
    curr = curr[p] as Accounts;
  });

  return accounts;
}

export function get(accounts: Accounts, path: string[]): PublicKey | undefined {
  // Only return if pubkey
  const ret: PublicKey | Accounts | undefined = path.reduce((acc, subPath) => {
    if (acc) {
      return (acc as Accounts)[subPath];
    }
  }, accounts as Accounts | PublicKey | undefined);

  if (ret && ret.toBase58) {
    return ret as PublicKey;
  }
}
