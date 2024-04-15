import { Program } from "@coral-xyz/anchor";
import { PROGRAM_ID, init } from "@helium/nft-delegation-sdk";
import { batchParallelInstructions, sendInstructions } from "@helium/spl-utils";
import { PublicKey, TransactionInstruction } from "@solana/web3.js";
import { useAsyncCallback } from "react-async-hook";
import { useHeliumVsrState } from "../contexts/heliumVsrContext";
import { PositionWithMeta } from "../sdk/types";
import BN from "bn.js";

export const useVotingDelegatePositions = () => {
  const { provider, registrar, refetch } = useHeliumVsrState();
  const { error, loading, execute } = useAsyncCallback(
    async ({
      positions,
      recipient,
      programId = PROGRAM_ID,
      expirationTime,
    }: {
      positions: PositionWithMeta[];
      recipient: PublicKey;
      programId?: PublicKey;
      expirationTime: BN;
    }) => {
      const isInvalid = !provider;

      const idl = await Program.fetchIdl(programId, provider);
      const nftDelegationProgram = await init(provider as any, programId, idl);

      if (loading) return;

      if (isInvalid || !nftDelegationProgram || !registrar) {
        throw new Error("Unable to voting delegate, Invalid params");
      } else {
        const instructions: TransactionInstruction[] = [];
        for (const position of positions) {
          const {
            instruction,
            pubkeys: { nextDelegation },
          } = await nftDelegationProgram.methods
            .delegateV0({
              expirationTime,
            })
            .accounts({
              asset: position.mint,
              recipient,
              delegationConfig: registrar.delegationConfig,
            })
            .prepare();
          // Don't delegate where there's already a delegation.
          if (await provider.connection.getAccountInfo(nextDelegation!)) {
            throw new Error(
              "Recipient wallet is already a proxy to this position"
            );
          } else {
            instructions.push(instruction);
          }
        }

        await batchParallelInstructions({ provider, instructions });
        // Wait a couple seconds for changes to hit pg-sink
        setTimeout(refetch, 2 * 1000);
      }
    }
  );

  return {
    error,
    loading,
    votingDelegatePositions: execute,
  };
};
