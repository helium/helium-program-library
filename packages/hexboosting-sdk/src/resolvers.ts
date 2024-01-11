import {
  ataResolver,
  combineResolvers,
  heliumCommonResolver,
  resolveIndividual,
} from "@helium/anchor-resolvers";
import { subDaoKey } from "@helium/helium-sub-daos-sdk";
import { PublicKey } from "@solana/web3.js";

export const hexboostingResolvers = combineResolvers(
  heliumCommonResolver,
  resolveIndividual(async ({ path, accounts }) => {
    if (path[path.length - 1] === "subDao" && accounts.paymentMint) {
      return subDaoKey(accounts.paymentMint as PublicKey)[0];
    }
  }),
  ataResolver({
    instruction: "boostV0",
    mint: "paymentMint",
    account: "paymentAccount",
    owner: "payer",
  })
);
