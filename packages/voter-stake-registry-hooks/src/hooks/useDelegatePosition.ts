import { Program } from "@coral-xyz/anchor";
import { useAnchorProvider } from "@helium/helium-react-hooks";
import { PROGRAM_ID, init } from "@helium/helium-sub-daos-sdk";
import { sendInstructions } from "@helium/spl-utils";
import { PublicKey, TransactionInstruction } from "@solana/web3.js";
import { useAsyncCallback } from "react-async-hook";
import { PositionWithMeta, SubDaoWithMeta } from "../sdk/types";

export const useDelegatePosition = () => {
  const provider = useAnchorProvider();
  const { error, loading, execute } = useAsyncCallback(
    async ({
      position,
      subDao,
      tokenOwnerRecordPk,
      programId = PROGRAM_ID,
    }: {
      position: PositionWithMeta;
      subDao: SubDaoWithMeta;
      tokenOwnerRecordPk: PublicKey | null;
      programId?: PublicKey;
    }) => {
      const isInvalid =
        !provider ||
        !provider.wallet ||
        position.isDelegated;

      const idl = await Program.fetchIdl(programId, provider);
      const hsdProgram = await init(provider as any, programId, idl);

      if (loading) return;

      if (isInvalid || !hsdProgram) {
        throw new Error("Unable to Delegate Position, Invalid params");
      } else {
        const instructions: TransactionInstruction[] = [];

        instructions.push(
          await hsdProgram.methods
            .delegateV0()
            .accounts({
              position: position.pubkey,
              subDao: subDao.pubkey,
            })
            .instruction()
        );

        await sendInstructions(
          provider,
          instructions
        )
      }
    }
  );

  return {
    error,
    loading,
    delegatePosition: execute,
  };
};
