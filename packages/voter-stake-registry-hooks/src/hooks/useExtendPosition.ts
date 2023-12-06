import { Program } from "@coral-xyz/anchor";
import { PROGRAM_ID, daoKey, init } from "@helium/helium-sub-daos-sdk";
import { sendInstructions } from "@helium/spl-utils";
import { init as initVsr } from "@helium/voter-stake-registry-sdk";
import { PublicKey, TransactionInstruction } from "@solana/web3.js";
import { useAsyncCallback } from "react-async-hook";
import { useHeliumVsrState } from "../contexts/heliumVsrContext";
import { PositionWithMeta } from "../sdk/types";

export const useExtendPosition = () => {
  const { provider } = useHeliumVsrState();
  const { error, loading, execute } = useAsyncCallback(
    async ({
      position,
      lockupPeriodsInDays,
      programId = PROGRAM_ID,
    }: {
      position: PositionWithMeta;
      lockupPeriodsInDays: number;
      programId?: PublicKey;
    }) => {
      const isInvalid = !provider;

      const idl = await Program.fetchIdl(programId, provider);
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
              .accounts({
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
              .accounts({
                position: position.pubkey,
              })
              .instruction()
          );
        }

        await sendInstructions(provider, instructions);
      }
    }
  );

  return {
    error,
    loading,
    extendPosition: execute,
  };
};
