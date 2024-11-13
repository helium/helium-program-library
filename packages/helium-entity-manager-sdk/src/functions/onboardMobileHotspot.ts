import { Program } from "@coral-xyz/anchor";
import { HeliumEntityManager } from "@helium/idls/lib/types/helium_entity_manager";
import {
  ProofArgsAndAccountsArgs,
  proofArgsAndAccounts,
} from "@helium/spl-utils";
import { PublicKey } from "@solana/web3.js";
import BN from "bn.js";
import { keyToAssetForAsset } from "../helpers";
import { mobileHotspotVoucherKey, mobileInfoKey } from "../pdas";
import { MobileDeploymentInfoV0 } from "..";

export async function onboardMobileHotspot({
  program,
  rewardableEntityConfig,
  assetId,
  maker,
  location,
  dao,
  payer,
  dcFeePayer,
  deviceType = "cbrs",
  deploymentInfo,
  ...rest
}: {
  program: Program<HeliumEntityManager>;
  payer?: PublicKey;
  dcFeePayer?: PublicKey;
  assetId: PublicKey;
  location?: BN;
  rewardableEntityConfig: PublicKey;
  deploymentInfo?: MobileDeploymentInfoV0 | null;
  maker: PublicKey;
  dao: PublicKey;
  deviceType?: "cbrs" | "wifiIndoor" | "wifiOutdoor";
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
  const makerAcc = await program.account.makerV0.fetchNullable(maker);
  const voucherK = mobileHotspotVoucherKey(
    rewardableEntityConfig,
    keyToAsset.entityKey
  )[0];
  const voucher = await program.account.mobileHotspotVoucherV0.fetchNullable(
    voucherK
  );

  if (voucher) {
    return program.methods
      .onboardMobileHotspotV1({
        ...args,
        deploymentInfo: deploymentInfo as any,
      })
      .preInstructions([
        await program.methods
          .payMobileVoucherV0({
            ...args,
          })
          .accounts({
            ...accounts,
            payer,
            rewardableEntityConfig,
            hotspotOwner: owner,
            maker,
            dao,
            mobileVoucher: voucherK,
            keyToAsset: keyToAssetKey,
          })
          .instruction(),
      ])
      .postInstructions(
        typeof location == "undefined"
          ? []
          : [
              await program.methods
                .updateMobileInfoV0({
                  ...args,
                  location,
                  deploymentInfo: null,
                })
                .accounts({
                  ...accounts,
                  payer,
                  rewardableEntityConfig,
                  hotspotOwner: owner,
                  dao,

                  mobileInfo: info,
                })
                .instruction(),
            ]
      )
      .accounts({
        // hotspot: assetId,
        ...accounts,
        payer,
        rewardableEntityConfig,
        hotspotOwner: owner,
        mobileInfo: info,
        maker,
        dao,
        mobileVoucher: voucherK,
        refund: voucher.refund,
        keyToAsset: keyToAssetKey,
      })
      .remainingAccounts(remainingAccounts);
  } else {
    return program.methods
      .onboardMobileHotspotV0({
        ...args,
        location: typeof location == "undefined" ? null : location,
        deviceType: {
          [deviceType]: {},
        } as any,
        deploymentInfo: deploymentInfo as any,
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
}
