import { Connection, PublicKey, TransactionInstruction } from "@solana/web3.js";
import { daoKey, init as initHsd } from "@helium/helium-sub-daos-sdk";
import { init as initVsr } from "@helium/voter-stake-registry-sdk";
import BN from "bn.js";

type HsdProgram = Awaited<ReturnType<typeof initHsd>>;
type VsrProgram = Awaited<ReturnType<typeof initVsr>>;

export interface DaoCheckResult {
  isDao: boolean;
  daoKey: PublicKey;
}

export async function checkIsDao(
  connection: Connection,
  depositMint: PublicKey,
): Promise<DaoCheckResult> {
  const [dao] = daoKey(depositMint);
  const accountInfo = await connection.getAccountInfo(dao);
  return {
    isDao: accountInfo !== null,
    daoKey: dao,
  };
}

export interface ResetLockupArgs {
  kind: { constant: Record<string, never> } | { cliff: Record<string, never> };
  periods: number;
}

// DAO positions use the HSD program (which wraps VSR); sub-DAO positions use VSR directly
export async function createResetLockupInstruction(
  connection: Connection,
  hsdProgram: HsdProgram,
  vsrProgram: VsrProgram,
  position: PublicKey,
  depositMint: PublicKey,
  args: ResetLockupArgs,
): Promise<TransactionInstruction> {
  const { isDao, daoKey: dao } = await checkIsDao(connection, depositMint);

  if (isDao) {
    return hsdProgram.methods
      .resetLockupV0(
        args as Parameters<typeof hsdProgram.methods.resetLockupV0>[0],
      )
      .accountsPartial({ position, dao })
      .instruction();
  }

  return vsrProgram.methods
    .resetLockupV0(
      args as Parameters<typeof vsrProgram.methods.resetLockupV0>[0],
    )
    .accountsPartial({ position })
    .instruction();
}

export interface TransferArgs {
  amount: BN;
}

export async function createTransferInstruction(
  connection: Connection,
  hsdProgram: HsdProgram,
  vsrProgram: VsrProgram,
  sourcePosition: PublicKey,
  targetPosition: PublicKey,
  depositMint: PublicKey,
  args: TransferArgs,
): Promise<TransactionInstruction> {
  const { isDao, daoKey: dao } = await checkIsDao(connection, depositMint);

  if (isDao) {
    return hsdProgram.methods
      .transferV0(args)
      .accountsPartial({ sourcePosition, targetPosition, depositMint, dao })
      .instruction();
  }

  return vsrProgram.methods
    .transferV0(args)
    .accountsPartial({ sourcePosition, targetPosition, depositMint })
    .instruction();
}
