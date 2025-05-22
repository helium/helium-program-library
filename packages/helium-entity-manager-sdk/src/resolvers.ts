import { subDaoEpochInfoResolver } from "@helium/helium-sub-daos-sdk";
import {
  ataResolver,
  combineResolvers,
  heliumCommonResolver,
  resolveIndividual,
} from "@helium/anchor-resolvers";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";
import { PublicKey } from "@solana/web3.js";
import { init } from "./init";
import {
  iotInfoKey,
  keyToAssetKey,
  mobileInfoKey,
  programApprovalKey,
  sharedMerkleKey,
} from "./pdas";
import { notEmittedKey } from "@helium/no-emit-sdk";

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
  ataResolver({
    instruction: "approveMakerV0",
    account: "escrow",
    mint: "hntMint",
    owner: "maker",
  }),
  resolveIndividual(async ({ path, provider }) => {
    if (path[path.length - 1] == "dntPrice") {
      return new PublicKey("DQ4C1tzvu28cwo1roN1Wm6TW35sfJEjLh517k3ZeWevx");
    }
  }),
  resolveIndividual(async ({ path, args, accounts, provider }) => {
    if (path[path.length - 1] == "programApproval" && accounts.dao) {
      let programId = args[args.length - 1] && args[args.length - 1].programId;
      if (!programId) {
        return;
      }
      return programApprovalKey(accounts.dao as PublicKey, programId)[0];
    }
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
          args[args.length - 1].entityKey,
          args[args.length - 1].encoding || "b58"
        )
      )[0];
    } else if (
      path[path.length - 1] === "keyToAsset" &&
      idlIx.name === "issueIotOperationsFundV0" &&
      accounts.dao
    ) {
      return (
        await keyToAssetKey(
          accounts.dao as PublicKey,
          Buffer.from("iot_operations_fund", "utf8")
        )
      )[0];
    } else if (
      path[path.length - 1] === "keyToAsset" &&
      idlIx.name === "issueNotEmittedEntityV0" &&
      accounts.dao
    ) {
      return (
        await keyToAssetKey(
          accounts.dao as PublicKey,
          Buffer.from("not_emitted", "utf8")
        )
      )[0];
    }
  }),
  resolveIndividual(async ({ path, args, provider, accounts, idlIx }) => {
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
    }
  }),
  resolveIndividual(async ({ path, idlIx, provider }) => {
    if (path[path.length - 1] === "recipient") {
      if (idlIx.name === "issueNotEmittedEntityV0") {
        return notEmittedKey()[0];
      }
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
    }
  }),
  resolveIndividual(async ({ path, accounts }) => {
    if (
      path[path.length - 1] === "ownerHotspotAta" &&
      (accounts.owner || accounts.hotspotOwner) &&
      accounts.hotspot
    ) {
      return getAssociatedTokenAddressSync(
        accounts.hotspot as PublicKey,
        (accounts.owner || accounts.hotspotOwner) as PublicKey
      );
    }
  }),
  resolveIndividual(async ({ path, args }) => {
    if (
      path[path.length - 1] === "sharedMerkle" &&
      args[0] &&
      args[0].proofSize
    ) {
      return sharedMerkleKey(args[0].proofSize)[0];
    }
  }),
  ataResolver({
    instruction: "issueIotOperationsFundV0",
    account: "recipientAccount",
    owner: "recipient",
    mint: "mint",
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
  ataResolver({
    instruction: "issueNotEmittedEntityV0",
    mint: "mint",
    account: "recipientAccount",
    owner: "recipient",
  }),
  ataResolver({
    instruction: "onboardMobileHotspotV0",
    mint: "dntMint",
    account: "dntBurner",
    owner: "payer",
  }),
  ataResolver({
    instruction: "onboardDataOnlyMobileHotspotV0",
    mint: "dntMint",
    account: "dntBurner",
    owner: "payer",
  }),
  subDaoEpochInfoResolver
);
