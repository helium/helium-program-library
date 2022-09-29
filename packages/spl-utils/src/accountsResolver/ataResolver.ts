import * as anchor from "@project-serum/anchor";
import { PublicKey } from "@solana/web3.js";
import { resolveIndividual } from "./individual";
import { getAssociatedTokenAddress } from "@solana/spl-token";
import { get } from "./utils";

export type AtaResolverArgs = {
  instruction: string;
  account: string;
  mint: string;
  owner: string;
};

export function ataResolver<T extends anchor.Idl>({
  instruction,
  account,
  mint,
  owner,
}: AtaResolverArgs): anchor.CustomAccountResolver<T> {
  return resolveIndividual(async ({ path, accounts, idlIx }) => {
    if (idlIx.name === instruction && path[path.length - 1] === account) {
      const mintKey = get(accounts, [
        ...path.slice(0, path.length - 1),
        mint,
      ]) as PublicKey;
      const ownerKey = get(accounts, [
        ...path.slice(0, path.length - 1),
        owner,
      ]) as PublicKey;

      return getAssociatedTokenAddress(mintKey, ownerKey, true);
    }
    return undefined;
  });
}
