import { Program } from "@coral-xyz/anchor";
import { HeliumEntityManager } from "@helium/idls/lib/types/helium_entity_manager";
import {
  ProofArgsAndAccountsArgs,
  proofArgsAndAccounts,
} from "@helium/spl-utils";
import { PublicKey } from "@solana/web3.js";
import BN from "bn.js";
import { keyToAssetForAsset } from "../helpers";
import { iotInfoKey } from "../pdas";

export async function onboardIotHotspot({
  program,
  rewardableEntityConfig,
  assetId,
  maker,
  dao,
  dcFeePayer,
  payer,
  location,
  elevation,
  gain,
  ...rest
}: {
  program: Program<HeliumEntityManager>;
  rewardableEntityConfig: PublicKey;
  payer?: PublicKey;
  dcFeePayer?: PublicKey;
  maker: PublicKey;
  location?: BN;
  elevation?: number;
  gain?: number;
  dao: PublicKey;
} & Omit<ProofArgsAndAccountsArgs, "connection">) {
  const { asset, args, accounts, remainingAccounts } =
    await proofArgsAndAccounts({
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
  const [info] = await iotInfoKey(
    rewardableEntityConfig,
    keyToAsset.entityKey
  );
  const makerAcc = await program.account.makerV0.fetchNullable(maker);

  return program.methods
    .onboardIotHotspotV0({
      ...args,
      location: typeof location == "undefined" ? null : location,
      elevation: typeof elevation == "undefined" ? null : elevation,
      gain: typeof gain == "undefined" ? null : gain,
    })
    .accounts({
      // hotspot: assetId,
      ...accounts,
      dcFeePayer,
      payer,
      rewardableEntityConfig,
      hotspotOwner: owner,
      iotInfo: info,
      maker,
      dao,
      issuingAuthority: makerAcc?.issuingAuthority,
      keyToAsset: keyToAssetKey,
    })
    .remainingAccounts(remainingAccounts);
}
