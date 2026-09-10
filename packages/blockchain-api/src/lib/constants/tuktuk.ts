import { env } from "@/lib/env";
import { PublicKey } from "@solana/web3.js";

export const TASK_QUEUE_ID = new PublicKey(
  process.env.HPL_CRONS_TASK_QUEUE ||
    "H39gEszvsi6AT4rYBiJTuZHJSF5hMHy6CKGTd7wzhsg7",
);

/** Remote pre-task URL a mini fanout queues; its length sizes the fanout and its pre task. */
export const preTaskUrl = (assetId: string) =>
  `${env.ORACLE_URL}/v1/tuktuk/asset/${assetId}`;
