import { Program } from "@coral-xyz/anchor";
import { PROGRAM_ID, daoKey, init } from "@helium/helium-sub-daos-sdk";
import { sendInstructions } from "@helium/spl-utils";
import { init as initVsr } from "@helium/voter-stake-registry-sdk";
import { PublicKey, TransactionInstruction } from "@solana/web3.js";
import { useAsyncCallback } from "react-async-hook";
import { useHeliumVsrState } from "../contexts/heliumVsrContext";
import { PositionWithMeta } from "../sdk/types";
import { fetchBackwardsCompatibleIdl } from "@helium/spl-utils";

export const useExtendPosition = () => {
  const { provider } = useHeliumVsrState();
  const { error, loading, execute } = useAsyncCallback(
    async ({
      position,
      lockupPeriodsInDays,
      programId = PROGRAM_ID,
      onInstructions,
    }: {
      position: PositionWithMeta;
      lockupPeriodsInDays: number;
      programId?: PublicKey;
      // Instead of sending the transaction, let the caller decide
      onInstructions?: (
        instructions: TransactionInstruction[]
      ) => Promise<void>;
    }) => {
      const isInvalid = !provider;

      const idl = await fetchBackwardsCompatibleIdl(programId, provider as any);
      const hsdProgram = await init(provider as any, programId, idl);
      const vsrProgram = await initVsr(provider as any);
      const mint = position.votingMint.mint;

      if (loading) return;

      if (isInvalid || !hsdProgram) {
        throw new Error("Unable to Extend Position, Invalid params");
      } else {
        const instructions: TransactionInstruction[] = [];
        const [dao] = daoKey(mint);
        const isDao = Boolean(await provider.connection.getAccountInfo(dao));

        if (isDao) {
          instructions.push(
            await hsdProgram.methods
              .resetLockupV0({
                kind: position.lockup.kind,
                periods: lockupPeriodsInDays,
              } as any)
              .accountsPartial({
                position: position.pubkey,
                dao: dao,
              })
              .instruction()
          );
        } else {
          instructions.push(
            await vsrProgram.methods
              .resetLockupV0({
                kind: position.lockup.kind,
                periods: lockupPeriodsInDays,
              } as any)
              .accountsPartial({
                position: position.pubkey,
              })
              .instruction()
          );
        }

        if (onInstructions) {
          await onInstructions(instructions);
        } else {
          await sendInstructions(provider, instructions);
        }
      }
    }
  );

  return {
    error,
    loading,
    extendPosition: execute,
  };
};
