import { BN } from "@coral-xyz/anchor";
import { dataCreditsKey } from "@helium/data-credits-sdk";
import {
  iotInfoKey,
  mobileInfoKey,
  rewardableEntityConfigKey,
} from "@helium/helium-entity-manager-sdk";
import type { init as initHem } from "@helium/helium-entity-manager-sdk";
import { daoKey, subDaoKey } from "@helium/helium-sub-daos-sdk";
import {
  DC_MINT,
  HNT_MINT,
  IOT_MINT,
  MOBILE_MINT,
} from "@helium/spl-utils";
import { PROGRAM_ID as BUBBLEGUM_PROGRAM_ID } from "@metaplex-foundation/mpl-bubblegum";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";
import type { AccountMeta, TransactionInstruction } from "@solana/web3.js";
import { PublicKey } from "@solana/web3.js";

/** The helium-entity-manager Anchor program, as the SDK builds it. */
type HemProgram = Awaited<ReturnType<typeof initHem>>;

/** The sub-DAO an update targets. */
export type HotspotUpdateNetwork = "iot" | "mobile";

/** Merkle-proof arguments shared by both update instructions. */
export interface UpdateProofArgs {
  dataHash: number[];
  creatorHash: number[];
  root: number[];
  index: number;
}

const HNT_DAO = daoKey(HNT_MINT)[0];
const DC_KEY = dataCreditsKey(DC_MINT)[0];

const SUB_DAO: Record<HotspotUpdateNetwork, PublicKey> = {
  iot: subDaoKey(IOT_MINT)[0],
  mobile: subDaoKey(MOBILE_MINT)[0],
};

export const REWARDABLE_ENTITY_CONFIG: Record<HotspotUpdateNetwork, PublicKey> =
  {
    iot: rewardableEntityConfigKey(SUB_DAO.iot, "IOT")[0],
    mobile: rewardableEntityConfigKey(SUB_DAO.mobile, "MOBILE")[0],
  };

/** The iot_info / mobile_info PDA holding a hotspot's on-chain metadata. */
export function hotspotInfoKey(
  network: HotspotUpdateNetwork,
  entityKey: string
): PublicKey {
  const config = REWARDABLE_ENTITY_CONFIG[network];
  return network === "iot"
    ? iotInfoKey(config, entityKey)[0]
    : mobileInfoKey(config, entityKey)[0];
}

/** The DC associated token account an owner-paid update burns from. */
export function dcBurnerFor(owner: PublicKey): PublicKey {
  return getAssociatedTokenAddressSync(DC_MINT, owner, true);
}

/**
 * Accounts common to `updateIotInfoV0` and `updateMobileInfoV0` when the hotspot
 * owner pays: the owner is the transaction payer, the DC fee payer and the leaf
 * owner, and the DC is burned from the owner's own DC token account. Every
 * account is supplied, so building the instruction needs no account resolution
 * and therefore no RPC round-trips.
 */
function ownerPaidUpdateAccounts(
  network: HotspotUpdateNetwork,
  owner: PublicKey,
  merkleTree: PublicKey
) {
  const [treeAuthority] = PublicKey.findProgramAddressSync(
    [merkleTree.toBuffer()],
    BUBBLEGUM_PROGRAM_ID
  );

  return {
    payer: owner,
    dcFeePayer: owner,
    hotspotOwner: owner,
    dcBurner: dcBurnerFor(owner),
    merkleTree,
    treeAuthority,
    rewardableEntityConfig: REWARDABLE_ENTITY_CONFIG[network],
    dao: HNT_DAO,
    subDao: SUB_DAO[network],
    dcMint: DC_MINT,
    dc: DC_KEY,
  };
}

/**
 * Refuses a hotspot whose compressed-NFT leaf is delegated to anyone but its
 * owner. The update instruction verifies the leaf with both its owner and its
 * delegate bound to `hotspot_owner`, so the owner's signature alone cannot
 * satisfy it and the transaction could only fail on chain.
 */
export function assertNotDelegated({
  owner,
  delegate,
  errors,
}: {
  owner: string;
  delegate: PublicKey | string | null | undefined;
  errors: { CONFLICT: (opts: { message: string }) => Error };
}): void {
  if (!delegate) return;
  const address = typeof delegate === "string" ? delegate : delegate.toBase58();
  if (address === owner) return;

  throw errors.CONFLICT({
    message:
      "Hotspot is delegated to another authority and cannot be updated with feePayer=owner",
  });
}

/**
 * Refuses an update the owner cannot fund in DC. Only a location assert costs
 * DC, so this runs only when `locationAssertDcFee` priced one.
 */
export function assertDcCovered({
  required,
  available,
  errors,
}: {
  required: BN;
  available: bigint;
  errors: {
    INSUFFICIENT_FUNDS: (opts: {
      message: string;
      data: { required: number; available: number };
    }) => Error;
  };
}): void {
  const needed = BigInt(required.toString());
  if (available >= needed) return;

  throw errors.INSUFFICIENT_FUNDS({
    message: "Insufficient DC balance to assert this hotspot's location",
    data: { required: Number(needed), available: Number(available) },
  });
}

/**
 * On-chain gain is tenths of a dBi and elevation is whole meters, both i32.
 */
export function toOnChainGain(gain: number | undefined): number | null {
  return gain === undefined ? null : Math.trunc(gain * 10);
}

export function toOnChainElevation(
  elevation: number | undefined
): number | null {
  return elevation === undefined ? null : Math.trunc(elevation);
}

/** The fields an update writes, per sub-DAO. */
export type OwnerPaidUpdate =
  | {
      network: "iot";
      location: BN | null;
      elevation: number | null;
      gain: number | null;
    }
  | {
      network: "mobile";
      location: BN | null;
      // Anchor's generated arg type for the deployment-info enum.
      deploymentInfo: unknown;
    };

/**
 * Builds the `update{Iot,Mobile}InfoV0` instruction paid for by the hotspot
 * owner rather than the maker. Port of `direct_update_instruction` in
 * helium-lib: same accounts, same argument layout, with the payer, DC fee payer
 * and DC burner all bound to the owner.
 */
export async function buildOwnerPaidUpdateInstruction({
  program,
  owner,
  entityKey,
  merkleTree,
  proofArgs,
  remainingAccounts,
  update,
}: {
  program: HemProgram;
  owner: PublicKey;
  entityKey: string;
  merkleTree: PublicKey;
  proofArgs: UpdateProofArgs;
  remainingAccounts: AccountMeta[];
  update: OwnerPaidUpdate;
}): Promise<TransactionInstruction> {
  const accounts = ownerPaidUpdateAccounts(update.network, owner, merkleTree);

  if (update.network === "iot") {
    return program.methods
      .updateIotInfoV0({
        ...proofArgs,
        location: update.location,
        elevation: update.elevation,
        gain: update.gain,
      })
      .accountsPartial({
        ...accounts,
        iotInfo: hotspotInfoKey("iot", entityKey),
      })
      .remainingAccounts(remainingAccounts)
      .instruction();
  }

  return program.methods
    .updateMobileInfoV0({
      ...proofArgs,
      location: update.location,
      deploymentInfo: update.deploymentInfo as any,
    })
    .accountsPartial({
      ...accounts,
      mobileInfo: hotspotInfoKey("mobile", entityKey),
    })
    .remainingAccounts(remainingAccounts)
    .instruction();
}

/**
 * DC the update burns. Both handlers burn the location staking fee once, and
 * only when a location is asserted that differs from the one already stored;
 * every other field is free.
 */
export function locationAssertDcFee({
  newLocation,
  currentLocation,
  stakingFee,
}: {
  newLocation: BN | null;
  currentLocation: BN | null | undefined;
  stakingFee: BN | null;
}): BN {
  if (!newLocation || !stakingFee) return new BN(0);
  if (currentLocation && currentLocation.eq(newLocation)) return new BN(0);
  return stakingFee;
}

/**
 * The `ConfigSettingsV0` variant as Anchor decodes it: one key per variant,
 * with camelCased fields.
 */
type MobileDeviceFees = { deviceType: object; locationStakingFee: BN };

type RewardableEntityConfigSettings = {
  iotConfig?: {
    fullLocationStakingFee: BN;
    dataonlyLocationStakingFee: BN;
  };
  mobileConfig?: { fullLocationStakingFee: BN };
  mobileConfigV1?: { feesByDevice: MobileDeviceFees[] };
  mobileConfigV2?: { feesByDevice: MobileDeviceFees[] };
};

/**
 * The location staking fee the sub-DAO charges this hotspot, mirroring
 * `ConfigSettingsV0::mobile_device_fees` and the IoT handler's full/data-only
 * split. Returns null when the settings variant carries no fee for this
 * hotspot, in which case the on-chain program is left to price the burn.
 */
export function locationStakingFee(
  settings: RewardableEntityConfigSettings,
  hotspot:
    | { network: "iot"; isFullHotspot: boolean }
    | { network: "mobile"; deviceType: object }
): BN | null {
  if (hotspot.network === "iot") {
    const iot = settings.iotConfig;
    if (!iot) return null;
    return hotspot.isFullHotspot
      ? iot.fullLocationStakingFee
      : iot.dataonlyLocationStakingFee;
  }

  if (settings.mobileConfig) {
    return settings.mobileConfig.fullLocationStakingFee;
  }

  const feesByDevice =
    settings.mobileConfigV2?.feesByDevice ??
    settings.mobileConfigV1?.feesByDevice;
  if (!feesByDevice) return null;

  const wanted = variantName(hotspot.deviceType);
  if (!wanted) return null;
  const fees = feesByDevice.find(
    (entry) => variantName(entry.deviceType) === wanted
  );
  return fees ? fees.locationStakingFee : null;
}

/** The single key of an Anchor-decoded unit enum, e.g. `wifiIndoor`. */
function variantName(variant: object): string | undefined {
  return Object.keys(variant)[0];
}

/** Structural view of the deployment-info enum, as Anchor decodes it. */
type DeploymentInfoLike = {
  wifiInfoV0?: { serial?: string | null } | null;
  cbrsInfoV0?: unknown;
};

/**
 * The deployment info the program actually stores. `preserve_wifi_serial`
 * carries the existing serial forward whenever the incoming wifi info ships
 * none — absent, null or empty — so a size estimate has to measure the same
 * value the account will end up holding.
 */
export function withPreservedWifiSerial<
  T extends DeploymentInfoLike | undefined
>(incoming: T, existing: DeploymentInfoLike | undefined): T {
  const wifi = incoming?.wifiInfoV0;
  if (!wifi) return incoming;
  if (wifi.serial) return incoming;

  const existingSerial = existing?.wifiInfoV0?.serial;
  if (!existingSerial) return incoming;

  return {
    ...incoming,
    wifiInfoV0: { ...wifi, serial: existingSerial },
  } as T;
}

/**
 * Lamports the owner must supply for `resize_to_fit`: it tops the account up to
 * the rent-exempt minimum for its new size and never withdraws, so a shrink or
 * an already-funded account costs nothing.
 */
export function resizeTopUpLamports(
  rentExemptForNewSize: number,
  currentLamports: number
): number {
  return Math.max(0, rentExemptForNewSize - currentLamports);
}

/**
 * `resize_to_fit` sizes the account to its serialized length plus 64 bytes of
 * padding, so the rent target must include that same padding.
 */
export const RESIZE_PADDING_BYTES = 64;
