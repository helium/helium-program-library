import { Program } from "@coral-xyz/anchor";
import { PROGRAM_ID, init } from "@helium/nft-delegation-sdk";
import { sendInstructions } from "@helium/spl-utils";
import { PublicKey, TransactionInstruction } from "@solana/web3.js";
import { useAsyncCallback } from "react-async-hook";
import { useHeliumVsrState } from "../contexts/heliumVsrContext";
import { PositionWithMeta } from "../sdk/types";

export const useVotingDelegatePositions = () => {
  const { provider } = useHeliumVsrState();
  const { error, loading, execute } = useAsyncCallback(
    async ({
      positions,
      recipient,
      programId = PROGRAM_ID,
    }: {
      positions: PositionWithMeta[];
      recipient: PublicKey;
      programId?: PublicKey;
    }) => {
      const isInvalid = !provider;

      const idl = await Program.fetchIdl(programId, provider);
      const nftDelegationProgram = await init(provider as any, programId, idl);

      if (loading) return;

      if (isInvalid || !nftDelegationProgram) {
        throw new Error("Unable to voting delegate, Invalid params");
      } else {
        const instructions: TransactionInstruction[] = [];
        for (const position of positions) {
          instructions.push(
            await nftDelegationProgram.methods
              .delegateV0()
              .accounts({
                mint: position.mint,
                recipient,
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
    votingDelegatePositions: execute,
  };
};
