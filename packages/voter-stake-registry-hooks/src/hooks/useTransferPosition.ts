import { Program } from "@coral-xyz/anchor";
import { useAnchorProvider } from "@helium/helium-react-hooks";
import { PROGRAM_ID, daoKey, init } from "@helium/helium-sub-daos-sdk";
import { sendInstructions, toBN } from "@helium/spl-utils";
import { init as initVsr } from "@helium/voter-stake-registry-sdk";
import { getMint } from "@solana/spl-token";
import { PublicKey, TransactionInstruction } from "@solana/web3.js";
import { useAsyncCallback } from "react-async-hook";
import { PositionWithMeta } from "../sdk/types";

export const useTransferPosition = () => {
  const provider = useAnchorProvider();
  const { error, loading, execute } = useAsyncCallback(
    async ({
      sourcePosition,
      amount,
      targetPosition,
      programId = PROGRAM_ID,
    }: {
      sourcePosition: PositionWithMeta;
      amount: number;
      targetPosition: PositionWithMeta;
      programId?: PublicKey;
    }) => {
      const isInvalid =
        !provider ||
        sourcePosition.numActiveVotes > 0 ||
        targetPosition.numActiveVotes > 0;

      const idl = await Program.fetchIdl(programId, provider);
      const hsdProgram = await init(provider as any, programId, idl);
      const vsrProgram = await initVsr(provider as any);

      const registrar = await vsrProgram.account.registrar.fetch(
        sourcePosition.registrar
      );
      const mint =
        registrar.votingMints[sourcePosition.votingMintConfigIdx].mint;

      if (loading) return;

      if (isInvalid || !hsdProgram) {
        throw new Error("Unable to Transfer Position, position has active votes");
      } else {
        const instructions: TransactionInstruction[] = [];
        const [dao] = daoKey(mint);
        const isDao = Boolean(await provider.connection.getAccountInfo(dao));
        const mintAcc = await getMint(provider.connection, mint);
        const amountToTransfer = toBN(
          amount,
          mintAcc!.decimals
        );

        if (isDao) {
          instructions.push(
            await hsdProgram.methods
              .transferV0({
                amount: amountToTransfer,
              })
              .accounts({
                sourcePosition: sourcePosition.pubkey,
                targetPosition: targetPosition.pubkey,
                depositMint: mint,
                dao: dao,
              })
              .instruction()
          );
        } else {
          instructions.push(
            await vsrProgram.methods
              .transferV0({
                amount: amountToTransfer,
              })
              .accounts({
                sourcePosition: sourcePosition.pubkey,
                targetPosition: targetPosition.pubkey,
                depositMint: mint,
              })
              .instruction()
          );
        }

        if (amountToTransfer.eq(sourcePosition.amountDepositedNative)) {
          instructions.push(
            await vsrProgram.methods
              .closePositionV0()
              .accounts({
                position: sourcePosition.pubkey,
              })
              .instruction()
          );
        }

        await sendInstructions(provider, instructions)
      }
    }
  );

  return {
    error,
    loading,
    transferPosition: execute,
  };
};