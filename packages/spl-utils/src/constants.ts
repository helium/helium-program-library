import { PublicKey } from "@solana/web3.js";

export const DC_MINT = new PublicKey(
  "EMsZWzk2zqwtTvvimTVD1qq4usxsNptt1HWSHYurcBWA"
);

export const HNT_MINT = new PublicKey(
  "2ZiWvqkZ8DCZwjoJ3HudxnChPrPPk6UVWraouC3GHvRN"
);

export const MOBILE_MINT = new PublicKey(
  "BuPZsYRpvVrYUPZMqZAJun2E7mTeAUwpCekb2uJUvapr"
);

export const IOT_MINT = new PublicKey(
  "2GtqVJo9yKXuJbyZrxr3ouQbU8AXDJQq74DQpFXFrHg7"
);

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

export const MOBILE_PRICE_FEED = new PublicKey(
  "DQ4C1tzvu28cwo1roN1Wm6TW35sfJEjLh517k3ZeWevx"
);

export const IOT_PRICE_FEED = new PublicKey(
  "8UYEn5Weq7toHwgcmctvcAxaNJo3SJxXEayM57rpoXr9"
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
