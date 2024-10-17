import { PublicKey } from "@solana/web3.js";

export const DC_MINT = new PublicKey(
  "dcuc8Amr83Wz27ZkQ2K9NS6r8zRpf1J6cvArEBDZDmm"
);

export const HNT_MINT = new PublicKey("APqAVo5q9erS8GaXcbJuy3Gx4ikuSzXjzY4SnyppPUm1");

export const MOBILE_MINT = new PublicKey(
  "CoQciaEADT77zudZQm4atzWjHmHcJKfzZBivbifHScvZ"
);

export const IOT_MINT = new PublicKey("g69eEQjY4bv1UvjaeTUcaCNoJ6v8jSsjL3dojN6uC4B");

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