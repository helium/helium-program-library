import { PublicKey } from "@solana/web3.js";

export const DC_MINT = new PublicKey(
  "dcuc8Amr83Wz27ZkQ2K9NS6r8zRpf1J6cvArEBDZDmm"
);

export const HNT_MINT = new PublicKey("hntyVP6YFm1Hg25TN9WGLqM12b8TQmcknKrdu1oxWux");

export const MOBILE_MINT = new PublicKey(
  "mb1eu7TzEc71KxDpsmsKoucSSuuoGLv1drys1oP2jh6"
);

export const IOT_MINT = new PublicKey("iotEVVZLEywoTn1QdwNPddxPWszn3zFhEot3MfL9fns");

// TODO: Replace with actual HNT feed
export const HNT_PYTH_PRICE_FEED = new PublicKey(
  "4DdmDswskDxXGpwHrXUfn2CNUm9rt21ac79GHNTN3J33"
);

export const HELIUM_COMMON_LUT_DEVNET = new PublicKey(
  "FnqYkQ6ZKnVKdkvYCGsEeiP5qgGqVbcFUkGduy2ta4gA"
);

export const HELIUM_COMMON_LUT = new PublicKey(
  "43eY9L2spbM2b1MPDFFBStUiFGt29ziZ1nc1xbpzsfVt"
);

export const HNT_PRICE_FEED_ID = "0x649fdd7ec08e8e2a20f425729854e90293dcbe2376abc47197a14da6ff339756"

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