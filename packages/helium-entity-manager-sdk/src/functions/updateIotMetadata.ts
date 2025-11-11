import { HeliumEntityManager } from "@helium/idls/lib/types/helium_entity_manager";
import { BN, Program } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import { iotInfoKey } from "../pdas";
import {
  proofArgsAndAccounts,
  ProofArgsAndAccountsArgs,
} from "@helium/spl-utils";
import { HELIUM_DAO, keyToAssetForAsset } from "../helpers";

export async function updateIotMetadata({
  program,
  rewardableEntityConfig,
  assetId,
  location,
  elevation,
  gain,
  dcFeePayer,
  payer,
  dao = HELIUM_DAO,
  ...rest
}: {
  program: Program<HeliumEntityManager>;
  payer?: PublicKey;
  dcFeePayer?: PublicKey;
  location: BN | null;
  elevation: number | null;
  assetEndpoint?: string;
  gain: number | null;
  assetId: PublicKey;
  rewardableEntityConfig: PublicKey;
  dao?: PublicKey
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
  const [info] = await iotInfoKey(rewardableEntityConfig, keyToAsset.entityKey);

  return program.methods
    .updateIotInfoV0({
      location,
      elevation,
      gain,
      ...args,
    })
    .accountsPartial({
      // hotspot: assetId,
      ...accounts,
      dcFeePayer,
      payer,
      rewardableEntityConfig,
      hotspotOwner: owner,
      iotInfo: info,
    })
    .remainingAccounts(remainingAccounts);
}
