import { Accounts } from "@coral-xyz/anchor";
import { heliumCommonResolver } from "@helium/anchor-resolvers";
import {
  ataResolver,
  combineResolvers,
  resolveIndividual,
} from "@helium/anchor-resolvers";
import { PublicKey } from "@solana/web3.js";
import { netIdKey, organizationKey } from "./pdas";
import { PROGRAM_ID } from "./constants";
import { heliumEntityManagerResolvers, keyToAssetKey, programApprovalKey, sharedMerkleKey } from "@helium/helium-entity-manager-sdk";

export const lazyDistributorResolvers = combineResolvers(
  heliumCommonResolver,
  heliumEntityManagerResolvers,
  ataResolver({
    instruction: "initializeRoutingManagerV0",
    account: "tokenAccount",
    mint: "collection",
    owner: "routingManager",
  }),
  resolveIndividual(async ({ args, path, accounts }) => {
    if (
      args[0] &&
      args[0].netId &&
      path[path.length - 1] == "netId" &&
      accounts.routingManager
    ) {
      return netIdKey(accounts.routingManager as PublicKey, args[0].netId)[0];
    } else if (
      args[0] &&
      args[0].oui &&
      path[path.length - 1] === "organization" &&
      accounts.routingManager
    ) {
      return organizationKey(
        accounts.routingManager as PublicKey,
        args[0].oui
      )[0];
    } else if (path[path.length - 1] == "programApproval" && accounts.dao) {
      return programApprovalKey(accounts.dao as PublicKey, PROGRAM_ID)[0];
    } else if (
      path[path.length - 1] === "keyToAsset" &&
      args[args.length - 1] &&
      args[args.length - 1].oui &&
      accounts.dao
    ) {
      return (
        await keyToAssetKey(
          accounts.dao as PublicKey,
          `OUI_${args[args.length - 1].oui}`,
          "utf-8"
        )
      )[0];
    } else if (path[path.length - 1] === "sharedMerkle") {
      return sharedMerkleKey(3)[0]
    }
  })
);

