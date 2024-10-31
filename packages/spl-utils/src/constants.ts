import { PublicKey } from "@solana/web3.js";

export const DC_MINT = new PublicKey(
  "dcuc8Amr83Wz27ZkQ2K9NS6r8zRpf1J6cvArEBDZDmm"
);

export const HNT_MINT = new PublicKey("hntyVP6YFm1Hg25TN9WGLqM12b8TQmcknKrdu1oxWux");

export const MOBILE_MINT = new PublicKey(
  "mb1eu7TzEc71KxDpsmsKoucSSuuoGLv1drys1oP2jh6"
);

export const IOT_MINT = new PublicKey("iotEVVZLEywoTn1QdwNPddxPWszn3zFhEot3MfL9fns");

export const HNT_PYTH_PRICE_FEED = new PublicKey(
  "4DdmDswskDxXGpwHrXUfn2CNUm9rt21ac79GHNTN3J33"
);

export const SOL_PYTH_PRICE_FEED = new PublicKey(
  "7UVimffxr9ow1uXYxsr4LHAcV58mLzhmwaeKvJ1pjLiE"
);

export const MOBILE_PYTH_PRICE_FEED = new PublicKey(
  "DQ4C1tzvu28cwo1roN1Wm6TW35sfJEjLh517k3ZeWevx"
);

export const USDC_PYTH_PRICE_FEED = new PublicKey(
  "Dpw1EAVrSB1ibxiDQyTAW6Zip3J4Btk2x4SgApQCeFbX"
);

export const USDC_MINT = new PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");

export const HELIUM_COMMON_LUT_DEVNET = new PublicKey(
  "FnqYkQ6ZKnVKdkvYCGsEeiP5qgGqVbcFUkGduy2ta4gA"
);

export const HELIUM_COMMON_LUT = new PublicKey(
  "4DdmDswskDxXGpwHrXUfn2CNUm9rt21ac79GHNTN3J33"
);

export type Network = "hnt" | "mobile" | "iot";
export const networksToMint: { [Network: string]: PublicKey } = {
  hnt: HNT_MINT,
  mobile: MOBILE_MINT,
  iot: IOT_MINT,
};

export const realmNames: Record<string, string> = {
  [HNT_MINT.toBase58()]: "Helium",
  [MOBILE_MINT.toBase58()]: "Helium MOBILE",
  [IOT_MINT.toBase58()]: "Helium IOT",
};