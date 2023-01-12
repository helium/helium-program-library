import { subDaoEpochInfoResolver } from "@helium/helium-sub-daos-sdk";
import {
  ataResolver,
  combineResolvers,
  heliumCommonResolver,
  resolveIndividual,
} from "@helium/spl-utils";
import { iotInfoKey, keyToAssetKey, mobileInfoKey } from "./pdas";
import { getAssociatedTokenAddress } from "@solana/spl-token";
import { PublicKey } from "@solana/web3.js";
import { getLeafAssetId } from "@metaplex-foundation/mpl-bubblegum";

export const heliumEntityManagerResolvers = combineResolvers(
  heliumCommonResolver,
  ataResolver({
    instruction: "initializeMakerV0",
    account: "tokenAccount",
    mint: "collection",
    owner: "maker",
  }),
  resolveIndividual(async ({ path, args }) => {
    if (
      path[path.length - 1] === "keyToAsset" &&
      args[args.length - 1].entityKey
    ) {
      return (await keyToAssetKey(args[args.length - 1].entityKey))[0];
    }
  }),
  resolveIndividual(async ({ path, args, provider, accounts }) => {
    if (
      path[path.length - 1] === "iotInfo" &&
      args[args.length - 1].index &&
      accounts.merkleTree &&
      accounts.rewardableEntityConfig
    ) {
      return iotInfoKey(
        accounts.rewardableEntityConfig as PublicKey,
        await getLeafAssetId(
          accounts.merkleTree as PublicKey,
          args[args.length - 1].index
        )
      )[0];
    } else if (path[path.length - 1] === "recipient") {
      // @ts-ignore
      return provider.wallet?.publicKey;
    }
  }),
  resolveIndividual(async ({ path, args, provider, accounts }) => {
    if (
      path[path.length - 1] === "mobileInfo" &&
      args[args.length - 1].index &&
      accounts.merkleTree &&
      accounts.rewardableEntityConfig
    ) {
      return mobileInfoKey(
        accounts.rewardableEntityConfig as PublicKey,
        await getLeafAssetId(
          accounts.merkleTree as PublicKey,
          args[args.length - 1].index
        )
      )[0];
    } else if (path[path.length - 1] === "recipient") {
      // @ts-ignore
      return provider.wallet?.publicKey;
    }
  }),
  resolveIndividual(async ({ path, accounts }) => {
    if (
      path[path.length - 1] === "ownerHotspotAta" &&
      (accounts.owner || accounts.hotspotOwner) &&
      accounts.hotspot
    ) {
      return getAssociatedTokenAddress(
        accounts.hotspot as PublicKey,
        (accounts.owner || accounts.hotspotOwner) as PublicKey
      );
    }
  }),
  ataResolver({
    instruction: "issueEntityV0",
    account: "recipientTokenAccount",
    mint: "hotspot",
    owner: "hotspotOwner",
  }),
  ataResolver({
    account: "dcBurner",
    mint: "dcMint",
    owner: "dcFeePayer",
  }),
  subDaoEpochInfoResolver
);
