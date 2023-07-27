import { Program } from "@coral-xyz/anchor";
import { useAnchorProvider } from "@helium/helium-react-hooks";
import {
  PROGRAM_ID,
  delegatedPositionKey,
  init,
} from "@helium/helium-sub-daos-sdk";
import { sendInstructions } from "@helium/spl-utils";
import { PublicKey, TransactionInstruction } from "@solana/web3.js";
import { useAsyncCallback } from "react-async-hook";
import { PositionWithMeta } from "../sdk/types";

export const useUndelegatePosition = () => {
  const provider = useAnchorProvider();
  const { error, loading, execute } = useAsyncCallback(
    async ({
      position,
      programId = PROGRAM_ID,
    }: {
      position: PositionWithMeta;
      programId?: PublicKey;
    }) => {
      const isInvalid = !provider || !position.isDelegated;

      const idl = await Program.fetchIdl(programId, provider);
      const hsdProgram = await init(provider as any, programId, idl);

      if (loading) return;

      if (isInvalid || !hsdProgram) {
        throw new Error("Unable to Undelegate Position, Invalid params");
      } else {
        const instructions: TransactionInstruction[] = [];
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

        await sendInstructions(provider, instructions);
      }
    }
  );

  return {
    error,
    loading,
    undelegatePosition: execute,
  };
};
