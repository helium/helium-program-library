import { PublicKey } from "@solana/web3.js";

export const LockupKind = {
  CONSTANT: "constant",
  CLIFF: "cliff",
} as const;

export type LockupKindType = (typeof LockupKind)[keyof typeof LockupKind];

export function toLockupKindArg(
  kind: LockupKindType,
): { constant: Record<string, never> } | { cliff: Record<string, never> } {
  return kind === LockupKind.CONSTANT ? { constant: {} } : { cliff: {} };
}

export function getLockupKind(lockup: { kind: object }): LockupKindType {
  return Object.keys(lockup.kind)[0] as LockupKindType;
}

export function flipLockupKind(kind: LockupKindType): LockupKindType {
  return kind === LockupKind.CONSTANT ? LockupKind.CLIFF : LockupKind.CONSTANT;
}

export const HNT_EPOCH = 20117;
export const MAX_LOCKUP_PERIOD_IN_DAYS = 1460;
export const SECS_PER_DAY = 86400;
export const MAX_TXS_PER_CALL = 5;
export const PREPAID_TX_FEES = 0.01;
export const TASK_QUEUE = new PublicKey(
  process.env.HPL_CRONS_TASK_QUEUE ||
    "H39gEszvsi6AT4rYBiJTuZHJSF5hMHy6CKGTd7wzhsg7",
);

export function secsToDays(secs: number): number {
  return secs / SECS_PER_DAY;
}
