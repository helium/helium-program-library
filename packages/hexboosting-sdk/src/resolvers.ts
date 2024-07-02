import {
  ataResolver,
  combineResolvers,
  heliumCommonResolver,
  resolveIndividual,
} from "@helium/anchor-resolvers";
import { subDaoKey } from "@helium/helium-sub-daos-sdk";
import { PublicKey } from "@solana/web3.js";
import { boostedHexKey } from "./pdas";

export const hexboostingResolvers = combineResolvers(
  heliumCommonResolver,
  resolveIndividual(async ({ path, accounts, args }) => {
    if (path[path.length - 1] === "subDao" && accounts.dntMint) {
      return subDaoKey(accounts.dntMint as PublicKey)[0];
    }
    if (path[path.length - 1] === "boostedHex" && accounts.boostConfig && args[0].deviceType && args[0].location) {
      return boostedHexKey(
        accounts.boostConfig as PublicKey,
        args[0].deviceType,
        args[0].location
      )[0]
    }
  }),
  ataResolver({
    instruction: "boostV0",
    mint: "paymentMint",
    account: "paymentAccount",
    owner: "payer",
  })
);
