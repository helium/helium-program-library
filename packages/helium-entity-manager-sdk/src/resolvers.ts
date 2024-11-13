import { subDaoEpochInfoResolver } from "@helium/helium-sub-daos-sdk";
import {
  ataResolver,
  combineResolvers,
  heliumCommonResolver,
  resolveIndividual,
} from "@helium/anchor-resolvers";
import {
  getAssociatedTokenAddressSync,
  NATIVE_MINT,
} from "@solana/spl-token";
import { PublicKey } from "@solana/web3.js";
import { init } from "./init";
import { iotInfoKey, keyToAssetKey, mobileHotspotVoucherKey, mobileInfoKey, programApprovalKey } from "./pdas";
import { notEmittedKey } from "@helium/no-emit-sdk";
import { Accounts } from "@coral-xyz/anchor";

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
    mint: "dntMint",
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
    const dao = accounts.dao || (accounts.issueEntityCommon as Accounts)?.dao;
    if (
      path[path.length - 1] === "keyToAsset" &&
      args[args.length - 1] &&
      args[args.length - 1].entityKey &&
      dao
    ) {
      return (
        await keyToAssetKey(
          dao as PublicKey,
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
    } else if (
      path[path.length - 1] === "mobileHotspotVoucher" &&
      accounts.rewardableEntityConfig
    ) {
      return (
        await mobileHotspotVoucherKey(
          accounts.rewardableEntityConfig as PublicKey,
          args[args.length - 1].entityKey,
          args[args.length - 1].keySerialization || "b58"
        )
      )[0];
    }
  }),
  resolveIndividual(async ({ path, provider, accounts }) => {
    if (
      path[path.length - 1] === "iotInfo" &&
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
    const merkleTree =
      accounts.merkleTree ||
      (accounts.issueEntityCommon as Accounts)?.merkleTree;
    const keyToAsset =
      accounts.keyToAsset ||
      (accounts.issueEntityCommon as Accounts)?.keyToAsset;
    if (
      path[path.length - 1] === "mobileInfo" &&
      merkleTree &&
      keyToAsset &&
      accounts.rewardableEntityConfig
    ) {
      let entityKey = args[0].entityKey;
      if (!entityKey) {
        // @ts-ignore
        const program = await init(provider);
        const keyToAssetAcc = await program.account.keyToAssetV0.fetch(
          keyToAsset as PublicKey
        );
        entityKey = keyToAssetAcc.entityKey;
      }
      return (
        await mobileInfoKey(
          accounts.rewardableEntityConfig as PublicKey,
          entityKey
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
    instruction: "mobileVoucherPayDcV0",
    mint: "dcMint",
    account: "dcBurner",
    owner: "maker",
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
    instruction: "mobileVoucherPayMobileV0",
    mint: "dntMint",
    account: "dntBurner",
    owner: "maker",
  }),
  ataResolver({
    instruction: "initializeMakerEscrowV0",
    mint: "mint",
    account: "escrow",
    owner: "conversionEscrow",
  }),
  ataResolver({
    instruction: "payMobileVoucherV0",
    mint: "hntMint",
    account: "hntBurner",
    owner: "maker",
  }),
  ataResolver({
    instruction: "payMobileVoucherV0",
    mint: "dcMint",
    account: "dcBurner",
    owner: "maker",
  }),
  ataResolver({
    instruction: "payMobileVoucherV0",
    mint: "dntMint",
    account: "dntBurner",
    owner: "maker",
  }),
  ataResolver({
    instruction: "onboardDataOnlyMobileHotspotV0",
    mint: "dntMint",
    account: "dntBurner",
    owner: "payer",
  }),
  subDaoEpochInfoResolver
);

function getParent(accounts: any, path: string[]) {
  let parent = accounts;
  for (let i = 0; i < path.length - 1; i++) {
    parent = parent[path[i]];
  }
  return parent;
}
