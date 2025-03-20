import { PublicKey } from "@solana/web3.js";
import { Asset, HNT_MINT } from "@helium/spl-utils";
import { keyToAssetKey } from "./pdas";
import { daoKey } from "@helium/helium-sub-daos-sdk";
import { IdlTypes } from "@coral-xyz/anchor";
import { HeliumEntityManager } from "@helium/idls/lib/types/helium_entity_manager";

export * from "./constants";
export { onboardIotHotspot } from "./functions/onboardIotHotspot";
export { onboardMobileHotspot } from "./functions/onboardMobileHotspot";
export { proofArgsAndAccounts } from "@helium/spl-utils";
export { updateIotMetadata } from "./functions/updateIotMetadata";
export { updateMobileMetadata } from "./functions/updateMobileMetadata";
export { init } from "./init";
export * from "./pdas";
export * from "./resolvers";
export { keyToAssetForAsset } from "./helpers";

export type MobileDeploymentInfoV0 =
  IdlTypes<HeliumEntityManager>["mobileDeploymentInfoV0"];
