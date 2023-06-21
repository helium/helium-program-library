import * as anchor from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import { resolveIndividual } from "./individual";
import { getAssociatedTokenAddress } from "@solana/spl-token";
import { get } from "./utils";

export type AtaResolverArgs = {
  instruction?: string; // If not provided, all instructions
  account: string;
  mint: string;
  owner?: string; // If not provided, use wallet
};

export function ataResolver<T extends anchor.Idl>({
  instruction,
  account,
  mint,
  owner,
}: AtaResolverArgs): anchor.CustomAccountResolver<T> {
  return resolveIndividual(async ({ path, accounts, idlIx, provider }) => {
    if ((typeof instruction === "undefined" || idlIx.name === instruction) && path.join(".") === account) {
      const mintKey = get(accounts, mint.split(".")) as PublicKey;
      // @ts-ignore
      const ownerKey = owner ? get(accounts, owner.split(".")) as PublicKey : provider.wallet?.publicKey;

      if (mintKey && ownerKey) {
        return getAssociatedTokenAddress(mintKey, ownerKey, true);
      }
    }
    return undefined;
  });
}
