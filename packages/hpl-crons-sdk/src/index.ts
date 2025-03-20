import { AnchorProvider, Idl, Program } from "@coral-xyz/anchor";
import {
  heliumCommonResolver
} from "@helium/anchor-resolvers";
import { HplCrons } from "@helium/idls/lib/types/hpl_crons";
import { fetchBackwardsCompatibleIdl } from "@helium/spl-utils";
import { PublicKey } from "@solana/web3.js";
import { PROGRAM_ID } from "./constants";

export * from "./constants";
export * from "./pdas";

export function nextAvailableTaskIds(taskBitmap: Buffer, n: number): number[] {
  if (n === 0) {
    return [];
  }

  const availableTaskIds: number[] = [];
  for (let byteIdx = 0; byteIdx < taskBitmap.length; byteIdx++) {
    const byte = taskBitmap[byteIdx];
    if (byte !== 0xff) {
      // If byte is not all 1s
      for (let bitIdx = 0; bitIdx < 8; bitIdx++) {
        if ((byte & (1 << bitIdx)) === 0) {
          availableTaskIds.push(byteIdx * 8 + bitIdx);
          if (availableTaskIds.length === n) {
            return availableTaskIds;
          }
        }
      }
    }
  }
  return availableTaskIds;
}

export async function init(
  provider: AnchorProvider,
  programId: PublicKey = PROGRAM_ID,
  idl?: Idl | null
): Promise<Program<HplCrons>> {
  if (!idl) {
    idl = await fetchBackwardsCompatibleIdl(programId, provider);
  }

  const program = new Program<HplCrons>(
    idl as HplCrons,
    provider,
    undefined,
    () => {
      return heliumCommonResolver;
    }
  ) as Program<HplCrons>;

  return program;
}
