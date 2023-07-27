import { BN } from "@coral-xyz/anchor";
import { useAnchorProvider } from "@helium/helium-react-hooks";
import { sendInstructions } from "@helium/spl-utils";
import { positionKey } from "@helium/voter-stake-registry-sdk";
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

export const useCreatePosition = () => {
  const provider = useAnchorProvider();
  const { result: client } = useAsync(
    (provider) => HeliumVsrClient.connect(provider),
    [provider]
  );
  const { error, loading, execute } = useAsyncCallback(
    async ({
      amount,
      lockupKind = { cliff: {} },
      lockupPeriodsInDays,
      mint,
    }: {
      amount: BN;
      lockupKind: any;
      lockupPeriodsInDays: number;
      mint: PublicKey;
    }) => {
      const isInvalid = !provider || !client;
      const registrar = getRegistrarKey(mint)

      if (isInvalid) {
        throw new Error("Unable to Create Position, Invalid params");
      } else {
        const mintKeypair = Keypair.generate();
        const position = positionKey(mintKeypair.publicKey)[0];
        const instructions: TransactionInstruction[] = [];
        const mintRent =
          await provider.connection.getMinimumBalanceForRentExemption(
            MintLayout.span
          );

        instructions.push(
          SystemProgram.createAccount({
            fromPubkey: provider.wallet!.publicKey!,
            newAccountPubkey: mintKeypair.publicKey,
            lamports: mintRent,
            space: MintLayout.span,
            programId: TOKEN_PROGRAM_ID,
          })
        );

        instructions.push(
          createInitializeMintInstruction(
            mintKeypair.publicKey,
            0,
            position,
            position
          )
        );

        instructions.push(
          await client.program.methods
            .initializePositionV0({
              kind: { [lockupKind]: {} },
              periods: lockupPeriodsInDays,
            } as any)
            .accounts({
              registrar,
              mint: mintKeypair.publicKey,
              depositMint: mint,
              recipient: provider.wallet!.publicKey!,
            })
            .instruction()
        );

        instructions.push(
          await client.program.methods
            .depositV0({
              amount,
            })
            .accounts({
              registrar,
              position,
              mint,
            })
            .instruction()
        );

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
