import { PublicKey } from "@solana/web3.js";

export const TASK_QUEUE_ID = new PublicKey(
  process.env.HPL_CRONS_TASK_QUEUE ||
    "H39gEszvsi6AT4rYBiJTuZHJSF5hMHy6CKGTd7wzhsg7",
);
