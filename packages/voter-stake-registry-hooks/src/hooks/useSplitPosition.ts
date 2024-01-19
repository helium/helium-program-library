import { Program } from "@coral-xyz/anchor";
import { PROGRAM_ID, daoKey, init } from "@helium/helium-sub-daos-sdk";
import {
  batchInstructionsToTxsWithPriorityFee,
  sendAndConfirmWithRetry,
  sendInstructions,
  toBN
} from "@helium/spl-utils";
import { init as initVsr, positionKey } from "@helium/voter-stake-registry-sdk";
import {
  MintLayout,
  TOKEN_PROGRAM_ID,
  createInitializeMintInstruction,
  getMint,
} from "@solana/spl-token";
import {
  Keypair,
  PublicKey,
  SystemProgram,
  TransactionInstruction,
} from "@solana/web3.js";
import { useAsyncCallback } from "react-async-hook";
import { useHeliumVsrState } from "../contexts/heliumVsrContext";
import { PositionWithMeta } from "../sdk/types";

export const useSplitPosition = () => {
  const { provider } = useHeliumVsrState();
  const { error, loading, execute } = useAsyncCallback(
    async ({
      sourcePosition,
      amount,
      lockupKind = { cliff: {} },
      lockupPeriodsInDays,
      programId = PROGRAM_ID,
      onInstructions,
    }: {
      sourcePosition: PositionWithMeta;
      amount: number;
      lockupKind: any;
      lockupPeriodsInDays: number;
      programId?: PublicKey;
      // Instead of sending the transaction, let the caller decide
      onInstructions?: (
        instructions: TransactionInstruction[],
        signers: Keypair[]
      ) => Promise<void>;
    }) => {
      const isInvalid = !provider || !provider.wallet;

      const idl = await Program.fetchIdl(programId, provider);
      const hsdProgram = await init(provider as any, programId, idl);
      const vsrProgram = await initVsr(provider as any);

      const mint = sourcePosition.votingMint.mint;

      if (loading) return;

      if (isInvalid || !hsdProgram) {
        throw new Error("Unable to Split Position, Invalid params");
      } else {
        const mintKeypair = Keypair.generate();
        const [dao] = daoKey(mint);
        const [targetPosition] = positionKey(mintKeypair.publicKey);
        const isDao = Boolean(await provider.connection.getAccountInfo(dao));
        const instructions: TransactionInstruction[] = [];
        const mintRent =
          await provider.connection.getMinimumBalanceForRentExemption(
            MintLayout.span
          );
        const mintAcc = await getMint(provider.connection, mint);
        const amountToTransfer = toBN(amount, mintAcc!.decimals);

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
            targetPosition,
            targetPosition
          )
        );

        instructions.push(
          await vsrProgram.methods
            .initializePositionV0({
              kind: { [lockupKind]: {} },
              periods: lockupPeriodsInDays,
            } as any)
            .accounts({
              registrar: sourcePosition.registrar,
              mint: mintKeypair.publicKey,
              depositMint: mint,
              recipient: provider.wallet!.publicKey!,
            })
            .instruction()
        );

        if (isDao) {
          instructions.push(
            await hsdProgram.methods
              .transferV0({
                amount: amountToTransfer,
              })
              .accounts({
                sourcePosition: sourcePosition.pubkey,
                targetPosition: targetPosition,
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
                targetPosition: targetPosition,
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

        if (onInstructions) {
          await onInstructions(instructions, [mintKeypair]);
        } else {
          const transactions = await batchInstructionsToTxsWithPriorityFee(provider, instructions)
          for (const tx of transactions) {
            await sendAndConfirmWithRetry(
              provider.connection,
              tx.serialize(),
              {
                skipPreflight: true,
              },
              "confirmed"
            );
          }
        }
      }
    }
  );

  return {
    error,
    loading,
    splitPosition: execute,
  };
};
