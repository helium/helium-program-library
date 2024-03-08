import { Program } from "@coral-xyz/anchor";
import {
  PROGRAM_ID,
  delegatedPositionKey,
  init,
} from "@helium/helium-sub-daos-sdk";
import { sendInstructions } from "@helium/spl-utils";
import { PublicKey, TransactionInstruction } from "@solana/web3.js";
import { useAsyncCallback } from "react-async-hook";
import { useHeliumVsrState } from "../contexts/heliumVsrContext";
import { PositionWithMeta, SubDaoWithMeta } from "../sdk/types";

export const useDelegatePosition = () => {
  const { provider } = useHeliumVsrState();
  const { error, loading, execute } = useAsyncCallback(
    async ({
      position,
      subDao,
      programId = PROGRAM_ID,
      onInstructions,
    }: {
      position: PositionWithMeta;
      subDao?: SubDaoWithMeta;
      programId?: PublicKey;
      // Instead of sending the transaction, let the caller decide
      onInstructions?: (
        instructions: TransactionInstruction[]
      ) => Promise<void>;
    }) => {
      const isInvalid =
        !provider || !provider.wallet || (!position.isDelegated && !subDao);
      const idl = await Program.fetchIdl(programId, provider);
      const hsdProgram = await init(provider as any, programId, idl);

      if (loading) return;

      if (isInvalid || !hsdProgram) {
        throw new Error("Unable to Delegate Position, Invalid params");
      } else {
        const instructions: TransactionInstruction[] = [];

        if (position.isDelegated) {
          const delegatedPosKey = delegatedPositionKey(position.pubkey)[0];
          const delegatedPosAcc =
            await hsdProgram.account.delegatedPositionV0.fetch(delegatedPosKey);

          instructions.push(
            await hsdProgram.methods
              .closeDelegationV0()
              .accounts({
                position: position.pubkey,
                subDao: delegatedPosAcc.subDao,
              })
              .instruction()
          );
        }

        if (subDao) {
          instructions.push(
            await hsdProgram.methods
              .delegateV0()
              .accounts({
                position: position.pubkey,
                subDao: subDao.pubkey,
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
    delegatePosition: execute,
  };
};
