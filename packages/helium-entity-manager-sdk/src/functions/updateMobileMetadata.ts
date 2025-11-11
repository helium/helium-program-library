import { HeliumEntityManager } from "@helium/idls/lib/types/helium_entity_manager";
import { BN, Program } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import { mobileInfoKey } from "../pdas";
import {
  proofArgsAndAccounts,
  ProofArgsAndAccountsArgs,
} from "@helium/spl-utils";
import { HELIUM_DAO, keyToAssetForAsset } from "../helpers";
import { MobileDeploymentInfoV0 } from "..";

export async function updateMobileMetadata({
  program,
  rewardableEntityConfig,
  assetId,
  location,
  dcFeePayer,
  payer,
  dao = HELIUM_DAO,
  deploymentInfo,
  ...rest
}: {
  program: Program<HeliumEntityManager>;
  payer?: PublicKey;
  dcFeePayer?: PublicKey;
  location: BN | null;
  assetEndpoint?: string;
  assetId: PublicKey;
  rewardableEntityConfig: PublicKey;
  deploymentInfo?: MobileDeploymentInfoV0 | null;
  dao?: PublicKey;
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
  const keyToAsset = await program.account.keyToAssetV0.fetch(keyToAssetKey);
  const [info] = await mobileInfoKey(
    rewardableEntityConfig,
    keyToAsset.entityKey
  );

  return program.methods
    .updateMobileInfoV0({
      location,
      deploymentInfo: deploymentInfo as any,
      ...args,
    })
    .accountsPartial({
      // hotspot: assetId,
      ...accounts,
      dcFeePayer,
      payer,
      rewardableEntityConfig,
      hotspotOwner: owner,
      mobileInfo: info,
    })
    .remainingAccounts(remainingAccounts);
}
