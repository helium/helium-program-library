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

export const LUT_ACCOUNTS = [
  // Programs
  "1azyuavdMyvsivtNxPoz6SucD18eDHeXzFCUPq5XU7w",
  "hdaoVTCqhfHHo75XdAMxBKdUqvq1i5bF23sisBqVgGR",
  "credMBJhYFzfn7NxBMdU4aUqFggAjgztaCcv2Fo6fPT",
  "hemjuPXBpNvggtaUnN1MwT3wrdhttKEfosTcc2P9Pg8",
  "circAbx64bbsscPbQzZAUvuXpHqrCe6fLMzc2uKXz9g",
  "treaf4wWBBty3fHdyBpo35Mz84M8k3heKXmjmi9vFt5",
  "1atrmQs3eq1N2FEYWu6tyTXbCjP4uQwExpjtnhXtS8h",
  "porcSnvH9pvcYPmQ65Y8qcZSRxQBiBBQX7UV5nmBegy",
  "rorcfdX4h9m9swCKgcypaHJ8NGYVANBpmV9EHn3cYrF",
  "hvsrNC3NKbcryqDs2DocYHZ9yPKEVzdSjQG6RVtK1s8",
  "fanqeMu3fw8R4LwKNbahPtYXJsyLL6NXyfe2BqzhfB6",
  "memMa1HG4odAFmUbGWfPwS1WWfK95k99F2YTkGvyxZr",
  "hexbnKYoA2GercNNhHUCCfrTRWrHjT6ujKPXTa5NPqJ",
  "noEmmgLmQdk6DLiPV8CSwQv3qQDyGEhz9m5A4zhtByv",
  "cnvEguKeWyyWnKxoQ9HwrzEVfztqKjwNmerDvxdHK9w",
  "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL",
  "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
  "11111111111111111111111111111111",
  // Lazy distributor IOT
  "37eiz5KzYwpAdLgrSh8GT1isKiJ6hcE5ET86dqaoCugL",
  // Lazy dist Oracle
  "orc1TYY5L4B4ZWDEMayTqu99ikPM9bQo9fqzoaCPP5Q",
  // Oracle signer
  "7WuVr8SGcZ4KxpHBEdRGVTeSwkhk1WGUXT7DEzvWpYu4",
  // Lazy dist mobile
  "GZtTp3AUo2AHdQe9BCJ6gXR9KqfruRvHnZ4QiJUALMcz",
  // Hnt pyth
  "4DdmDswskDxXGpwHrXUfn2CNUm9rt21ac79GHNTN3J33",
  // Mobile pyth
  "DQ4C1tzvu28cwo1roN1Wm6TW35sfJEjLh517k3ZeWevx",
  // Usdc pyth
  "Dpw1EAVrSB1ibxiDQyTAW6Zip3J4Btk2x4SgApQCeFbX",
  // Hnt
  "hntyVP6YFm1Hg25TN9WGLqM12b8TQmcknKrdu1oxWux",
  // dc
  "dcuc8Amr83Wz27ZkQ2K9NS6r8zRpf1J6cvArEBDZDmm",
  // Mobile
  "mb1eu7TzEc71KxDpsmsKoucSSuuoGLv1drys1oP2jh6",
  // Dao
  "BQ3MCuTT5zVBhNfQ4SjMh3NPVhFy73MPV8rjfq5d1zie",
  // Mobile subdao
  "Gm9xDCJawDEKDrrQW6haw94gABaYzQwCq4ZQU8h8bd22",
  // Iot subdao
  "39Lw1RH6zt8AJvKn3BTxmUDofzduCM2J3kSaGDZ8L7Sk",
  // Mobile Delegator pool
  "71Y96vbVWYkoVQUgVsd8LSBRRDrgp5pf1sKznM5KuaA7",
  // Mobile Delegator pool circuit breaker
  "2cocTPZ7aRT62wTDGkosF98oo4iqCtkZnFdNHWqNZLuS",
  // Iot delegator pool
  "6fvj6rSwTeCkY7i45jYZYpZEhKmPRSTmA29hUDiMSFtU",
  // Iot delegator pool circuit breaker
  "6mNUqFAyLBkV88Nj6ctrcv66iJMHwzNzV8XFUwLmGerG",
  // Mobile rewardable entity config
  "EP1FNydbuKjGopwXVrVLR71NnC9YMRbTg9aHfk3KfMRj",
  // Compression proram
  "cmtDvXumGCrqC1Age74AVPhSRVXJMd8PJS91L8KbNCK",
  // Mobile escrow circuit breaker
  "4qGj88CX3McdTXEviEaqeP2pnZJxRTsZFWyU3Mrnbku4",
  // Mobile escrow
  "GD37bnQdGkDsjNqnVGr9qWTnQJSKMHbsiXX9tXLMUcaL",
  // Iot escrow
  "4po3YMfioHkNP4mL4N46UWJvBoQDS2HFjzGm1ifrUWuZ",
  // Iot escrow circuit breaker
  "5veMSa4ks66zydSaKSPMhV7H2eF88HvuKDArScNH9jaG",
  // Hnt registrar
  "BMnWRWZrWqb6JMKznaDqNxWaWAHoaTzVabM6Qwyh3WKz",
  // Data credits
  "D1LbvrJQ9K2WbGPMbM3Fnrf5PSsDH1TDpjqJdHuvs81n",
  // HNT Proposal Config
  "22SWTDZVj1L81SXfwbEeUmdZBFj23MFmER3Gv8BmxbBS",
  // HNT state controller
  "7Vrme34DXPH8ow4HEAatZKwZF9AR5vq8MZhA3CanMEbr",
  // IOT proposal config
  "7cvYwyj6k4NEPNoaCTUufDdGJqqB6ZBRf4t3TrSSUGrc",
  // IOT State controller
  "3eEnmZBiJems6ipPtdQS2UkJYfPqzvnDzhWQuTTN2ou5",
  // IOT Registrar
  "7ZZopN1mx6ECcb3YCG8dbxeLpA44xq4gzA1ETEiaLoeL",
  // State controller program
  "stcfiqW3fwD9QCd8Bqr1NBLrs7dftZHBQe7RiMMA4aM",
  // Mobile proposal config
  "5c9JxRCj4CwhZwaUyjvpb4JJbKW7xpvEFq3Rb2upkytc",
  // Mobile registrar
  "C4DWaps9bLiqy4e81wJ7VTQ6QR7C4MWvwsei3ZjsaDuW",
  // Mobile state controller
  "r11HAkEaPqkFHwDVewcmWSfRrMaLYcBLGquC2RBn3Xp",
  // Instructions sysvar
  "Sysvar1nstructions1111111111111111111111111",
].map((a) => {
  return new PublicKey(a);
});
