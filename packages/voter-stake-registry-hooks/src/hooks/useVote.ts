import { BN } from "@coral-xyz/anchor";
import { useAnchorProvider } from "@helium/helium-react-hooks";
import { sendInstructions } from "@helium/spl-utils";
import { init, positionKey } from "@helium/voter-stake-registry-sdk";
import {
  MintLayout,
  createInitializeMintInstruction,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import {
  Keypair,
  PublicKey,
  SystemProgram,
  TransactionInstruction,
} from "@solana/web3.js";
import { useAsync, useAsyncCallback } from "react-async-hook";
import { HeliumVsrClient } from "../sdk/client";
import { getRegistrarKey } from "../utils/getPositionKeys";
import { useHeliumVsrState } from "../contexts/heliumVsrContext";

export const useVote = () => {
  const provider = useAnchorProvider();
  const { positions } = useHeliumVsrState();
  const { error, loading, execute } = useAsyncCallback(
    async ({
      choice
    }: {
      choice: number
    }) => {
      const isInvalid = !provider || !positions || positions.length === 0;

      if (isInvalid) {
        throw new Error("Unable to vote without positions. Please stake tokens first.");
      } else {
        const vsrProgram = await init(provider);
        const instructions = await Promise.all(positions.map(async position => {
          await vsrProgram.methods.voteV0
        }))

        await sendInstructions(provider, instructions, [mintKeypair]);
      }
    }
  );

  return {
    error,
    loading,
    createPosition: execute,
  };
};
