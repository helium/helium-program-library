import { PublicKey } from "@solana/web3.js";

export const PROGRAM_ID = new PublicKey(
  "tdcam4m5U74pEZQrsQ7fVAav4AUXXc6z8fkhvExfRVN",
);

// Devnet uses a different program id: the mainnet program keypair was lost,
// so devnet is deployed from a separately ground keypair.
export const DEVNET_PROGRAM_ID = new PublicKey(
  "tdcaoktKw6bDQ5ukLq5fLtje2kCkmHX7Sj9G77jY5dh",
);
