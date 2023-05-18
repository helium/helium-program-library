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
import {
  HeliumEntityManager,
  IDL,
} from "@helium/idls/lib/types/helium_entity_manager";
import { PROGRAM_ID } from "./constants";
import { Program } from "@coral-xyz/anchor";
import { init } from "./init";

export const heliumEntityManagerResolvers = combineResolvers(
  heliumCommonResolver,
  ataResolver({
    instruction: "initializeMakerV0",
    account: "tokenAccount",
    mint: "collection",
    owner: "maker",
  }),
  ataResolver({
    instruction: "initializeDataOnlyV0",
    account: "tokenAccount",
    mint: "collection",
    owner: "dataOnlyConfig",
  }),
  resolveIndividual(async ({ path }) => {
    if (path[path.length - 1] === "eccVerifier") {
      return new PublicKey("eccSAJM3tq7nQSpQTm8roxv4FPoipCkMsGizW2KBhqZ");
    }
  }),
  resolveIndividual(async ({ idlIx, path, args, accounts }) => {
    if (
      path[path.length - 1] === "keyToAsset" &&
      args[args.length - 1] &&
      args[args.length - 1].entityKey &&
      accounts.dao
    ) {
      return (
        await keyToAssetKey(
          accounts.dao as PublicKey,
          args[args.length - 1].entityKey
        )
      )[0];
    } else if (
      path[path.length - 1] === "keyToAsset" &&
      idlIx.name === "issueIotOperationsFundV0" &&
      accounts.dao
    ) {
      return (
        await keyToAssetKey(accounts.dao as PublicKey, Buffer.from("iot_operations_fund", "utf8"))
      )[0];
    }
  }),
  resolveIndividual(async ({ path, args, provider, accounts }) => {
    if (
      path[path.length - 1] === "iotInfo" &&
      args[args.length - 1].index &&
      accounts.merkleTree &&
      accounts.keyToAsset
    ) {
      // @ts-ignore
      const program = await init(provider);
      const keyToAssetAcc = await program.account.keyToAssetV0.fetch(
        accounts.keyToAsset as PublicKey
      );
      return (
        await iotInfoKey(
          accounts.rewardableEntityConfig as PublicKey,
          keyToAssetAcc.entityKey
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
      // @ts-ignore
      const program = await init(provider);
      const keyToAssetAcc = await program.account.keyToAssetV0.fetch(
        accounts.keyToAsset as PublicKey
      );
      return (
        await mobileInfoKey(
          accounts.rewardableEntityConfig as PublicKey,
          keyToAssetAcc.entityKey
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
    instruction: "issueIotOperationsFundV0",
    account: "recipientAccount",
    owner: "recipient",
    mint: "mint"
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
