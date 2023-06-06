import { unpackMint } from "@solana/spl-token";
import { AccountInfo, PublicKey } from "@solana/web3.js";
import { ParsedAccountBase, useAccount } from "@helium/account-fetch-cache-hooks";

export const MintParser = (pubKey: PublicKey, info: AccountInfo<Buffer>) => {
  const data = unpackMint(pubKey, info);

  const details = {
    pubkey: pubKey,
    account: {
      ...info,
    },
    info: data,
  } as ParsedAccountBase;

  return details;
};

export function useMint(key: PublicKey | undefined | null) {
  return useAccount(key, MintParser);
}
