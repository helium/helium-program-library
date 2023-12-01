import { BN, Program } from "@coral-xyz/anchor";
import { useSolanaUnixNow } from "@helium/helium-react-hooks";
import { PROGRAM_ID, daoKey, init } from "@helium/helium-sub-daos-sdk";
import { sendInstructions } from "@helium/spl-utils";
import { init as initVsr } from "@helium/voter-stake-registry-sdk";
import { PublicKey, TransactionInstruction } from "@solana/web3.js";
import { useAsyncCallback } from "react-async-hook";
import { useHeliumVsrState } from "../contexts/heliumVsrContext";
import { PositionWithMeta } from "../sdk/types";

export const useFlipPositionLockupKind = () => {
  const unixNow = useSolanaUnixNow();
  const { provider } = useHeliumVsrState();
  const { error, loading, execute } = useAsyncCallback(
    async ({
      position,
      programId = PROGRAM_ID,
    }: {
      position: PositionWithMeta;
      programId?: PublicKey;
    }) => {
      const isInvalid =
        !provider ||
        !provider.wallet ||
        !unixNow ||
        position.numActiveVotes > 0;

      const lockupKind = Object.keys(position.lockup.kind)[0] as string;
      const isConstant = lockupKind === "constant";
      const idl = await Program.fetchIdl(programId, provider);
      const hsdProgram = await init(provider as any, programId, idl);
      const vsrProgram = await initVsr(provider as any);

      const registrar = await vsrProgram.account.registrar.fetch(
        position.registrar
      );
      const mint = registrar.votingMints[position.votingMintConfigIdx].mint;

      if (loading) return;

      if (isInvalid) {
        if (isConstant) {
          throw new Error("Unable to Unlock Position, Invalid params");
        } else {
          throw new Error("Unable to Pause Position, Invalid params");
        }
      } else {
        const instructions: TransactionInstruction[] = [];
        const [dao] = daoKey(mint);
        const kind = isConstant ? { cliff: {} } : { constant: {} };
        const isDao = Boolean(await provider.connection.getAccountInfo(dao));
        const positionLockupPeriodInDays = Math.ceil(
          secsToDays(
            isConstant
              ? position.lockup.endTs.sub(position.lockup.startTs).toNumber()
              : position.lockup.endTs.sub(new BN(unixNow)).toNumber()
          )
        );

        if (isDao) {
          instructions.push(
            await hsdProgram.methods
              .resetLockupV0({
                kind,
                periods: positionLockupPeriodInDays,
              } as any)
              .accounts({
                position: position.pubkey,
                dao,
              })
              .instruction()
          );
        } else {
          instructions.push(
            await hsdProgram.methods
              .resetLockupV0({
                kind,
                periods: positionLockupPeriodInDays,
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
    flipPositionLockupKind: execute,
  };
};

function secsToDays(secs: number): number {
  return secs / (60 * 60 * 24);
}
