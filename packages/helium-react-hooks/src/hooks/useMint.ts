import { UseAccountState, useAccount } from "@helium/account-fetch-cache-hooks";
import { Mint, unpackMint } from "@solana/spl-token";
import { AccountInfo, PublicKey } from "@solana/web3.js";

export const MintParser = (pubKey: PublicKey, info: AccountInfo<Buffer>) => {
  const data = unpackMint(pubKey, info);

  return data;
};

export function useMint(key: PublicKey | undefined | null): UseAccountState<Mint> {
  return useAccount(key, MintParser);
}
