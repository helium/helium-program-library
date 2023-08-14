import { Program } from "@coral-xyz/anchor";
import { HeliumEntityManager } from "@helium/idls/lib/types/helium_entity_manager";
import {
  ProofArgsAndAccountsArgs,
  proofArgsAndAccounts,
} from "@helium/spl-utils";
import { PublicKey } from "@solana/web3.js";
import BN from "bn.js";
import { keyToAssetForAsset } from "../helpers";
import { mobileInfoKey } from "../pdas";

export async function onboardMobileHotspot({
  program,
  rewardableEntityConfig,
  assetId,
  maker,
  location,
  dao,
  payer,
  dcFeePayer,
  ...rest
}: {
  program: Program<HeliumEntityManager>;
  payer?: PublicKey;
  dcFeePayer?: PublicKey;
  assetId: PublicKey;
  location?: BN;
  rewardableEntityConfig: PublicKey;
  maker: PublicKey;
  dao: PublicKey;
} & Omit<ProofArgsAndAccountsArgs, "connection">) {
  const {
    asset,
    args,
    accounts,
    remainingAccounts,
  } = await proofArgsAndAccounts({
    connection: program.provider.connection,
    assetId,
    ...rest,
  });
  const {
    ownership: { owner },
  } = asset;

  const keyToAssetKey = keyToAssetForAsset(asset, dao);
  const keyToAsset = await program.account.keyToAssetV0.fetch(
    keyToAssetKey
  );
  const [info] = await mobileInfoKey(
    rewardableEntityConfig,
    keyToAsset.entityKey
  );
  const makerAcc = await program.account.makerV0.fetchNullable(maker);

  return program.methods
    .onboardMobileHotspotV0({
      ...args,
      location: typeof location == "undefined" ? null : location,
    })
    .accounts({
      // hotspot: assetId,
      ...accounts,
      dcFeePayer,
      payer,
      rewardableEntityConfig,
      hotspotOwner: owner,
      mobileInfo: info,
      maker,
      dao,
      issuingAuthority: makerAcc?.issuingAuthority,
      keyToAsset: keyToAssetKey,
    })
    .remainingAccounts(remainingAccounts);
}
